'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Package,
  ShoppingCart,
  TrendingUp,
  AlertTriangle,
  Plus,
  Search,
  Edit,
  RefreshCw,
  X,
  ArrowUpDown,
  ArrowLeftRight,
  Trash2,
} from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Skeleton, StatCardsSkeleton, TableSkeleton } from '@/components/ui';
import { fetchProducts, syncWebsiteProducts, deleteProduct } from '@/lib/storeApi';
import { getProductStockLocationLabels } from '@/lib/storeProductDisplay';
import api from '@/lib/api';
import {
  citiesFromBranches,
  filterBranchesByCity,
  filterBranchesForUser,
  unwrapApiList,
} from '@/lib/scopedFilters';
import type { StoreProduct, StoreCartLine } from '@/types/store';
import type { Branch } from '@/types/branch';
import AddProductDialog from '@/components/store/AddProductDialog';
import EditProductDialog from '@/components/store/EditProductDialog';
import AdjustStockDialog from '@/components/store/AdjustStockDialog';
import TransferStockDialog from '@/components/store/TransferStockDialog';
import AddToCartDialog from '@/components/store/AddToCartDialog';
import CartCheckoutDialog from '@/components/store/CartCheckoutDialog';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import styles from './store.module.css';
import { toast } from 'sonner';

function productMatchesCity(product: StoreProduct, cityId: string, branches: Branch[]): boolean {
  if (cityId === 'all') return true;

  const branchIdsInCity = new Set(
    branches.filter((b) => b.city === cityId).map((b) => b.id)
  );

  if (product.branch && branchIdsInCity.has(product.branch)) {
    return true;
  }

  return (product.size_stocks ?? []).some((row) => {
    const branchId = row.branch ?? null;
    return branchId != null && branchIdsInCity.has(branchId);
  });
}

/** ₪ with no decimals — prices here are whole shekels in practice. */
function shekel(value: number | string): string {
  return `₪${Number(value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

export default function StorePage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortField, setSortField] = useState<'name' | 'sale_price' | 'stock_quantity'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);

  // Cart
  const [cart, setCart] = useState<StoreCartLine[]>([]);
  const [isAddToCartOpen, setIsAddToCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);

  const cartCount = cart.reduce((n, l) => n + l.quantity, 0);
  const cartTotal = cart.reduce(
    (sum, l) => sum + l.sale_price * l.quantity + (Number(l.delivery_price) || 0) * l.quantity,
    0,
  );

  // The store report links here as /store?stock=low. Read from the address
  // rather than useSearchParams: this page is a client component, and that
  // hook would demand a Suspense boundary for no gain.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const wanted = new URLSearchParams(window.location.search).get('stock');
    if (wanted === 'low' || wanted === 'normal') setStockFilter(wanted);
  }, []);

  function addToCart(line: StoreCartLine) {
    setCart((prev) => {
      const existing = prev.find((l) => l.key === line.key);
      if (existing) {
        return prev.map((l) =>
          l.key === line.key
            ? { ...l, quantity: Math.min(l.max_stock, l.quantity + line.quantity) }
            : l
        );
      }
      return [...prev, line];
    });
  }

  function updateCartQuantity(key: string, quantity: number) {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  function removeCartLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  function removeProductFromCart(productId: string) {
    setCart((prev) => prev.filter((l) => l.product_id !== productId));
  }

  async function handleRemoveFromStore(product: StoreProduct) {
    const confirmed = window.confirm(`להסיר את "${product.name}" מהחנות?`);
    if (!confirmed) return;
    setDeletingProductId(product.id);
    try {
      await deleteProduct(product.id);
      removeProductFromCart(product.id);
      toast.success(`${product.name} הוסר מהחנות`);
      await loadData();
    } catch (error) {
      console.error('Failed to delete product:', error);
      toast.error('לא ניתן להסיר את המוצר מהחנות');
    } finally {
      setDeletingProductId(null);
    }
  }

  useEffect(() => {
    if (!user) return;
    loadData().then(() => backgroundSync());
  }, [user?.id]);

  async function refreshProducts() {
    const [productsData, branchesResponse] = await Promise.all([
      fetchProducts(),
      api.get('/core/branches/'),
    ]);
    const products = (productsData as any)?.results || productsData;
    const branches = branchesResponse.data?.results || branchesResponse.data;
    setProducts(Array.isArray(products) ? products : []);
    setBranches(
      filterBranchesForUser(unwrapApiList<Branch>(branches), user),
    );
  }

  async function backgroundSync() {
    setIsSyncing(true);
    try {
      const result = await syncWebsiteProducts();
      await refreshProducts();
      if (result.created > 0 || result.updated > 0) {
        toast.success(`סנכרון מהאתר: ${result.created} חדשים, ${result.updated} עודכנו`);
      }
    } catch (error) {
      console.warn('Background website sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }

  async function syncFromWebsite() {
    setIsSyncing(true);
    try {
      const result = await syncWebsiteProducts();
      if (result.errors?.length) {
        toast.warning(`סנכרון חלקי: ${result.created} חדשים, ${result.updated} עודכנו`);
      } else {
        toast.success(`סנכרון מהאתר: ${result.created} חדשים, ${result.updated} עודכנו (${result.total_crm} במערכת)`);
      }
      await refreshProducts();
    } catch (error) {
      console.error('Website sync failed:', error);
      toast.error('סנכרון מהאתר נכשל — ודאו שהאתר רץ על פורט 3001');
    } finally {
      setIsSyncing(false);
    }
  }

  async function loadData() {
    setIsLoading(true);
    try {
      await refreshProducts();
    } catch (error) {
      console.error('Error loading data:', error);
      setProducts([]);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (selectedBranch === 'all' || selectedBranch === 'delivery') return;
    if (selectedCity === 'all') return;
    const branch = branches.find((b) => b.id === selectedBranch);
    if (branch && branch.city !== selectedCity) {
      setSelectedBranch('all');
    }
  }, [selectedCity, selectedBranch, branches]);

  const cities = useMemo(() => citiesFromBranches(branches), [branches]);

  const branchesForFilter = useMemo(
    () => filterBranchesByCity(branches, selectedCity),
    [branches, selectedCity],
  );

  // Filter and sort products
  const filteredAndSortedProducts = products
    .filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCity = productMatchesCity(product, selectedCity, branches);
      const matchesBranch = selectedBranch === 'all' ||
                           (selectedBranch === 'delivery' ? !product.branch : product.branch === selectedBranch);
      const matchesStock = stockFilter === 'all' ||
                          (stockFilter === 'low' && product.is_low_stock) ||
                          (stockFilter === 'normal' && !product.is_low_stock);
      return matchesSearch && matchesCity && matchesBranch && matchesStock;
    })
    .sort((a, b) => {
      const modifier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name.localeCompare(b.name) * modifier;
      if (sortField === 'sale_price') return (a.sale_price - b.sale_price) * modifier;
      if (sortField === 'stock_quantity') return (a.stock_quantity - b.stock_quantity) * modifier;
      return 0;
    });

  // KPIs use location filters so numbers match the active city/branch filter
  const locationFilteredProducts = products.filter((product) => {
    const matchesCity = productMatchesCity(product, selectedCity, branches);
    const matchesBranch =
      selectedBranch === 'all' ||
      (selectedBranch === 'delivery' ? !product.branch : product.branch === selectedBranch);
    return matchesCity && matchesBranch;
  });
  const kpiBase =
    selectedCity === 'all' && selectedBranch === 'all' ? products : locationFilteredProducts;
  const totalProducts = kpiBase.length;
  const totalStock = kpiBase.reduce((sum, p) => sum + p.stock_quantity, 0);
  const inventoryValue = kpiBase.reduce((sum, p) => sum + (p.stock_quantity * p.cost_price), 0);
  const lowStockProducts = kpiBase.filter(p => p.is_low_stock);

  function handleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedCity('all');
    setSelectedBranch('all');
    setStockFilter('all');
  }

  const hasFilters = searchQuery || selectedCity !== 'all' || selectedBranch !== 'all' || stockFilter !== 'all';

  /** The four row actions, shared by the table and the phone card. */
  function rowActions(product: StoreProduct) {
    return (
      <>
        <button
          type="button"
          className={styles.iconBtn}
          title="ערוך מוצר"
          aria-label={`ערוך את ${product.name}`}
          onClick={() => {
            setSelectedProduct(product);
            setIsEditDialogOpen(true);
          }}
        >
          <Edit className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          title="עדכון מלאי"
          aria-label={`עדכון מלאי — ${product.name}`}
          onClick={() => {
            setSelectedProduct(product);
            setIsAdjustDialogOpen(true);
          }}
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
        {(product.size_stocks?.length ?? 0) >= 2 && (
          <button
            type="button"
            className={styles.iconBtn}
            title="העבר מלאי"
            aria-label={`העבר מלאי — ${product.name}`}
            onClick={() => {
              setSelectedProduct(product);
              setIsTransferDialogOpen(true);
            }}
          >
            <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className={`${styles.iconBtn} ${styles.iconDanger}`}
          title="הסר מהחנות"
          aria-label={`הסר את ${product.name} מהחנות`}
          disabled={deletingProductId === product.id}
          onClick={() => handleRemoveFromStore(product)}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          className={styles.cartBtn}
          disabled={product.stock_quantity === 0}
          aria-label={`הוסף את ${product.name} לסל`}
          onClick={() => {
            setSelectedProduct(product);
            setIsAddToCartOpen(true);
          }}
        >
          <ShoppingCart className="h-4 w-4" aria-hidden="true" />
          לסל
        </button>
      </>
    );
  }

  if (isLoading) {
    return (
      <div dir="rtl" className={`${theme.tokens} p-4 sm:p-6 space-y-5`} aria-busy="true" aria-label="טוען חנות">
        <Skeleton className="h-9 w-32" />
        <StatCardsSkeleton
          cards={4}
          gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
        />
        <TableSkeleton columns={6} />
      </div>
    );
  }

  return (
    // scope and tokens ride one element: the theme's mobile rule reserves room
    // for AppLayout's sidebar toggle on the first child of .tokens, and that
    // child should be the header row, not the whole page.
    <div dir="rtl" className={`${theme.tokens} ${theme.scope} p-4 sm:p-6`}>
      <>
        {/* Absorbs the theme's toggle reservation, which lands on the first
            child of .tokens and would otherwise indent the header's far side. */}
        <div aria-hidden className={styles.toggleSpacer} />

        {/* ---- header ---- */}
        <header className={`${theme.ph} ${styles.pageHeader}`}>
          <div>
            <h1 className={theme.phTitle}>חנות</h1>
            <p className={theme.phSub}>ניהול מוצרים ומכירות — מסונכרן עם חנות האתר (B2C)</p>
          </div>
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.action}
              onClick={syncFromWebsite}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? styles.spin : ''}`} aria-hidden="true" />
              {isSyncing ? 'מסנכרן…' : 'סנכרון מהאתר'}
            </button>
            <Link href="/store/dashboard" className={styles.action}>
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              דוחות מכירות
            </Link>
            <button
              type="button"
              className={`${styles.action} ${styles.actionPrimary}`}
              onClick={() => setIsAddDialogOpen(true)}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              הוסף מוצר
            </button>
          </div>
        </header>

        {/* ---- KPIs ---- */}
        <div className={`${theme.grid} ${theme.g4} ${styles.kpiGrid}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>סה"כ מוצרים</div>
            <div className={theme.kpiVal}>{totalProducts}</div>
            <div className={theme.kpiFoot}>
              <Package className="h-3.5 w-3.5 inline-block align-[-2px] ml-1" aria-hidden="true" />
              פריטים בקטלוג
            </div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>סה"כ במלאי</div>
            <div className={theme.kpiVal}>{totalStock.toLocaleString('he-IL')}</div>
            <div className={theme.kpiFoot}>יחידות בכל המיקומים</div>
          </div>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>שווי מלאי</div>
            <div className={theme.kpiVal}>{shekel(inventoryValue)}</div>
            <div className={theme.kpiFoot}>לפי מחיר עלות</div>
          </div>
          {/* Pressing it filters the list — the number and the rows behind it
              are the same question asked twice. */}
          <button
            type="button"
            className={`${theme.kpi} ${styles.kpiButton} ${stockFilter === 'low' ? styles.kpiActive : ''}`}
            onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
            aria-pressed={stockFilter === 'low'}
          >
            <div className={theme.kpiLbl}>מלאי נמוך</div>
            <div className={`${theme.kpiVal} ${lowStockProducts.length > 0 ? theme.down : ''}`}>
              {lowStockProducts.length}
            </div>
            <div className={theme.kpiFoot}>
              {lowStockProducts.length > 0
                ? stockFilter === 'low' ? 'מוצג — לחצו לביטול הסינון' : 'לחצו לסינון הרשימה'
                : 'הכול מעל הסף'}
            </div>
          </button>
        </div>

        {/* ---- low stock banner ---- */}
        {lowStockProducts.length > 0 && (
          <div className={`${styles.alert} ${theme.mt}`}>
            <div className={styles.alertHead}>
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              התראת מלאי נמוך
            </div>
            <div className={styles.alertList}>
              {lowStockProducts.map((product) => (
                <span key={product.id} className={styles.alertItem}>
                  {product.name} · {product.stock_quantity} יח׳
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ---- filters ---- */}
        <div className={`${theme.card} ${theme.mt}`}>
          <div className={styles.toolbar}>
            <div className={`${styles.field} ${styles.searchWrap}`}>
              <label htmlFor="store-search" className={styles.fieldLabel}>חיפוש</label>
              <Search className={`${styles.searchIcon} h-4 w-4`} aria-hidden="true" />
              <input
                id="store-search"
                className={styles.control}
                placeholder="שם מוצר או קטגוריה…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="store-city" className={styles.fieldLabel}>עיר</label>
              <select
                id="store-city"
                className={styles.control}
                value={selectedCity}
                onChange={(e) => setSelectedCity(e.target.value)}
              >
                <option value="all">כל הערים</option>
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>{city.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="store-branch" className={styles.fieldLabel}>סניף</label>
              <select
                id="store-branch"
                className={styles.control}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="all">כל הסניפים</option>
                <option value="delivery">משלוח</option>
                {Array.isArray(branchesForFilter) && branchesForFilter.map((branch: Branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="store-stock" className={styles.fieldLabel}>מלאי</label>
              <select
                id="store-stock"
                className={styles.control}
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
              >
                <option value="all">כל המלאי</option>
                <option value="low">מלאי נמוך</option>
                <option value="normal">מלאי תקין</option>
              </select>
            </div>

            {hasFilters && (
              <button type="button" className={styles.clearBtn} onClick={clearFilters}>
                <X className="h-4 w-4" aria-hidden="true" />
                נקה סינון
              </button>
            )}
          </div>

          {hasFilters && (
            <p className={styles.resultLine}>
              מציג <b>{filteredAndSortedProducts.length}</b> מתוך <b>{products.length}</b> מוצרים
            </p>
          )}
        </div>

        {/* ---- products ---- */}
        {filteredAndSortedProducts.length === 0 ? (
          <div className={`${theme.card} ${theme.mt}`}>
            <div className={styles.empty}>
              <Package className={`${styles.emptyIcon} h-12 w-12`} aria-hidden="true" />
              <p className={styles.emptyTitle}>
                {products.length === 0 ? 'אין מוצרים בחנות' : 'אין מוצרים שמתאימים לסינון'}
              </p>
              <p className={styles.emptyText}>
                {products.length === 0
                  ? 'הוסיפו מוצר או סנכרנו מהאתר כדי להתחיל'
                  : 'נסו לשנות את הסינון או לנקות אותו'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* wide: one row per product */}
            <div className={`${theme.card} ${theme.mt} ${styles.onlyWide}`}>
              <div className={theme.tableScroll}>
                <table className={theme.table}>
                  <thead>
                    <tr>
                      <th>
                        <button type="button" className={`${styles.sortBtn} ${sortField === 'name' ? styles.sortOn : ''}`} onClick={() => handleSort('name')}>
                          שם מוצר
                          <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </th>
                      <th>מידה</th>
                      <th>
                        <button type="button" className={`${styles.sortBtn} ${sortField === 'sale_price' ? styles.sortOn : ''}`} onClick={() => handleSort('sale_price')}>
                          מחיר
                          <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </th>
                      <th>מיקום</th>
                      <th>
                        <button type="button" className={`${styles.sortBtn} ${sortField === 'stock_quantity' ? styles.sortOn : ''}`} onClick={() => handleSort('stock_quantity')}>
                          מלאי
                          <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </th>
                      <th>הערות</th>
                      <th className={theme.n}>פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <div className={styles.prodName}>{product.name}</div>
                          <div className={styles.tagRow}>
                            <span className={`${theme.tag} ${theme.tagType}`}>{product.category}</span>
                            {product.branch_only && (
                              <span className={`${theme.tag} ${theme.tagOff}`}>לסניפים בלבד</span>
                            )}
                            {product.website_legacy_id != null && (
                              <span className={`${theme.tag} ${theme.tagOff}`}>באתר #{product.website_legacy_id}</span>
                            )}
                          </div>
                        </td>
                        <td>{product.size || '—'}</td>
                        <td>
                          <div className={styles.priceMain}>{shekel(product.sale_price)}</div>
                          <div className={styles.priceCost}>עלות {shekel(product.cost_price)}</div>
                        </td>
                        <td>
                          <div className={styles.locList}>
                            {getProductStockLocationLabels(product, branches).map((label, i) => (
                              <span key={`${product.id}-loc-${i}`}>{label}</span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <span className={`${theme.tag} ${product.is_low_stock ? theme.tagLow : theme.tagOk}`}>
                            {product.stock_quantity} יח׳
                          </span>
                        </td>
                        <td>
                          <div className={styles.notesCell} title={product.notes || undefined}>
                            {product.notes || '—'}
                          </div>
                        </td>
                        <td>
                          <div className={styles.actions}>{rowActions(product)}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* narrow: a card per product — seven columns do not fit a phone */}
            <div className={`${styles.cards} ${theme.mt} ${styles.onlyNarrow}`}>
              {filteredAndSortedProducts.map((product) => {
                const locations = getProductStockLocationLabels(product, branches);
                return (
                  <article key={product.id} className={styles.pcard}>
                    <div className={styles.pcardTop}>
                      <div style={{ minWidth: 0 }}>
                        <div className={styles.prodName}>{product.name}</div>
                        <div className={styles.tagRow}>
                          <span className={`${theme.tag} ${theme.tagType}`}>{product.category}</span>
                          {product.branch_only && (
                            <span className={`${theme.tag} ${theme.tagOff}`}>לסניפים בלבד</span>
                          )}
                          {product.website_legacy_id != null && (
                            <span className={`${theme.tag} ${theme.tagOff}`}>באתר #{product.website_legacy_id}</span>
                          )}
                        </div>
                      </div>
                      <span
                        className={`${theme.tag} ${product.is_low_stock ? theme.tagLow : theme.tagOk} ${styles.pcardStock}`}
                      >
                        {product.stock_quantity} יח׳
                      </span>
                    </div>

                    <div className={styles.pcardFacts}>
                      <div className={styles.fact}>
                        <span className={styles.factLbl}>מחיר מכירה</span>
                        <span className={styles.factVal}>{shekel(product.sale_price)}</span>
                      </div>
                      <div className={styles.fact}>
                        <span className={styles.factLbl}>עלות</span>
                        <span className={styles.factVal}>{shekel(product.cost_price)}</span>
                      </div>
                      {product.size ? (
                        <div className={styles.fact}>
                          <span className={styles.factLbl}>מידה</span>
                          <span className={styles.factVal}>{product.size}</span>
                        </div>
                      ) : null}
                    </div>

                    {locations.length > 0 && (
                      <div className={styles.pcardLoc}>
                        {locations.map((label, i) => (
                          <div key={`${product.id}-mloc-${i}`}>{label}</div>
                        ))}
                      </div>
                    )}

                    {product.notes ? <p className={styles.pcardNotes}>{product.notes}</p> : null}

                    <div className={styles.pcardActions}>{rowActions(product)}</div>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* ---- dialogs ---- */}
        <AddProductDialog
          isOpen={isAddDialogOpen}
          onClose={() => setIsAddDialogOpen(false)}
          onSuccess={loadData}
        />
        <EditProductDialog
          isOpen={isEditDialogOpen}
          onClose={() => {
            setIsEditDialogOpen(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onSuccess={loadData}
        />
        <AdjustStockDialog
          isOpen={isAdjustDialogOpen}
          onClose={() => {
            setIsAdjustDialogOpen(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onSuccess={loadData}
        />
        <TransferStockDialog
          isOpen={isTransferDialogOpen}
          onClose={() => {
            setIsTransferDialogOpen(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onSuccess={loadData}
        />
        {selectedProduct && (
          <AddToCartDialog
            isOpen={isAddToCartOpen}
            onClose={() => {
              setIsAddToCartOpen(false);
              setSelectedProduct(null);
            }}
            product={selectedProduct}
            onAdd={addToCart}
          />
        )}
        <CartCheckoutDialog
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          lines={cart}
          onUpdateQuantity={updateCartQuantity}
          onRemoveLine={removeCartLine}
          onSuccess={() => {
            setCart([]);
            setIsCheckoutOpen(false);
            loadData();
          }}
        />

        {/* ---- cart ---- */}
        {cart.length > 0 && (
          <div className={styles.cartBar}>
            <div className={styles.cartBarInner} dir="rtl">
              <span className={styles.cartCount}>
                <span style={{ position: 'relative', display: 'inline-flex' }}>
                  <ShoppingCart className="h-5 w-5" aria-hidden="true" />
                  <span className={styles.cartBadge}>{cartCount}</span>
                </span>
                ₪{cartTotal.toFixed(2)}
              </span>
              <button type="button" className={styles.cartPay} onClick={() => setIsCheckoutOpen(true)}>
                לתשלום
              </button>
              <button type="button" className={styles.cartClear} onClick={() => setCart([])}>
                רוקן סל
              </button>
            </div>
          </div>
        )}
      </>
    </div>
  );
}
