'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, ShoppingCart, TrendingUp, AlertTriangle, Plus, Search, Edit, RefreshCw, X, ArrowUpDown, ArrowLeftRight, Trash2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Select, Badge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Skeleton, StatCardsSkeleton, TableSkeleton } from '@/components/ui';
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

export default function StorePage() {
  const router = useRouter();
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

  if (isLoading) {
    return (
      <>
        <div className="p-6 space-y-6" aria-busy="true" aria-label="טוען חנות">
          <Skeleton className="h-9 w-32" />
          <StatCardsSkeleton
            cards={4}
            gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          />
          <TableSkeleton columns={6} />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">חנות</h1>
          <p className="text-gray-600">ניהול מוצרים ומכירות — מסונכרן עם חנות האתר (B2C)</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={syncFromWebsite} disabled={isSyncing}>
            <RefreshCw className={`ml-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'מסנכרן…' : 'סנכרון מהאתר'}
          </Button>
          <Link href="/store/dashboard">
            <Button variant="outline">
              <TrendingUp className="ml-2 h-4 w-4" />
              דוחות מכירות
            </Button>
          </Link>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="ml-2 h-4 w-4" />
            הוסף מוצר
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">סה"כ מוצרים</p>
                <p className="text-3xl font-bold mt-2">{totalProducts}</p>
              </div>
              <Package className="h-12 w-12 text-teal-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">סה"כ במלאי</p>
                <p className="text-3xl font-bold mt-2">{totalStock}</p>
              </div>
              <ShoppingCart className="h-12 w-12 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">שווי מלאי</p>
                <p className="text-3xl font-bold mt-2">₪{inventoryValue.toFixed(0)}</p>
              </div>
              <TrendingUp className="h-12 w-12 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className={lowStockProducts.length > 0 ? 'border-red-500' : ''}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">מלאי נמוך</p>
                <p className="text-3xl font-bold mt-2">{lowStockProducts.length}</p>
              </div>
              <AlertTriangle className={`h-12 w-12 ${lowStockProducts.length > 0 ? 'text-red-500' : 'text-gray-400'} opacity-80`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockProducts.length > 0 && (
        <Card className="border-red-500 bg-red-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="font-semibold text-red-600">התראת מלאי נמוך</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {lowStockProducts.map(product => (
                <Badge key={product.id} className="bg-red-100 text-red-800">
                  {product.name} ({product.stock_quantity} יחידות)
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row lg:items-end gap-3">
            {/* Search */}
            <div className="flex-1 min-w-0">
              <label htmlFor="store-search" className="block text-xs font-medium text-gray-500 mb-1">
                חיפוש
              </label>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="store-search"
                  placeholder="חיפוש לפי שם מוצר או קטגוריה..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10 h-10"
                />
              </div>
            </div>

            {/* Filter selects */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:w-auto">
              <div className="sm:w-40">
                <label htmlFor="store-city" className="block text-xs font-medium text-gray-500 mb-1">
                  עיר
                </label>
                <Select
                  id="store-city"
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full h-10 text-sm"
                >
                  <option value="all">כל הערים</option>
                  {cities.map((city) => (
                    <option key={city.id} value={city.id}>
                      {city.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:w-48">
                <label htmlFor="store-branch" className="block text-xs font-medium text-gray-500 mb-1">
                  סניף
                </label>
                <Select
                  id="store-branch"
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full h-10 text-sm"
                >
                  <option value="all">כל הסניפים</option>
                  <option value="delivery">משלוח</option>
                  {Array.isArray(branchesForFilter) && branchesForFilter.map((branch: Branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </Select>
              </div>
              <div className="sm:w-36">
                <label htmlFor="store-stock" className="block text-xs font-medium text-gray-500 mb-1">
                  מלאי
                </label>
                <Select
                  id="store-stock"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                  className="w-full h-10 text-sm"
                >
                  <option value="all">כל המלאי</option>
                  <option value="low">מלאי נמוך</option>
                  <option value="normal">מלאי תקין</option>
                </Select>
              </div>
            </div>

            {hasFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearFilters}
                className="h-10 px-3 shrink-0 text-gray-600"
              >
                <X className="h-4 w-4 ml-1" />
                נקה סינון
              </Button>
            )}
          </div>

          {hasFilters && (
            <p className="mt-3 pt-3 border-t text-xs text-gray-500">
              מציג <span className="font-semibold text-gray-700">{filteredAndSortedProducts.length}</span> מתוך{' '}
              <span className="font-semibold text-gray-700">{products.length}</span> מוצרים
            </p>
          )}
        </CardContent>
      </Card>


      {/* Products Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead onClick={() => handleSort('name')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    שם מוצר
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'name' ? 'text-teal-600' : 'text-gray-400'}`} />
                  </div>
                </TableHead>
                <TableHead>מידה</TableHead>
                <TableHead>מחיר עלות</TableHead>
                <TableHead onClick={() => handleSort('sale_price')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    מחיר מכירה
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'sale_price' ? 'text-teal-600' : 'text-gray-400'}`} />
                  </div>
                </TableHead>
                <TableHead>מיקום</TableHead>
                <TableHead onClick={() => handleSort('stock_quantity')} className="cursor-pointer">
                  <div className="flex items-center gap-1">
                    מלאי
                    <ArrowUpDown className={`h-3 w-3 ${sortField === 'stock_quantity' ? 'text-teal-600' : 'text-gray-400'}`} />
                  </div>
                </TableHead>
                <TableHead>הערות</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedProducts.map(product => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{product.name}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <Badge>{product.category}</Badge>
                        {product.branch_only && (
                          <Badge variant="secondary">לסניפים בלבד</Badge>
                        )}
                        {product.website_legacy_id != null && (
                          <Badge variant="outline">באתר #{product.website_legacy_id}</Badge>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{product.size || '-'}</TableCell>
                  <TableCell>₪{product.cost_price}</TableCell>
                  <TableCell className="text-teal-600 font-medium">₪{product.sale_price}</TableCell>
                  <TableCell className="max-w-[14rem]">
                    <div className="flex flex-col gap-0.5 text-sm leading-snug">
                      {getProductStockLocationLabels(product, branches).map((label, i) => (
                        <span key={`${product.id}-loc-${i}`}>{label}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={product.is_low_stock ? 'destructive' : 'outline'}>
                      {product.stock_quantity} יחידות
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate" title={product.notes}>
                    {product.notes || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedProduct(product);
                        setIsEditDialogOpen(true);
                      }}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" title="עדכון מלאי" onClick={() => {
                        setSelectedProduct(product);
                        setIsAdjustDialogOpen(true);
                      }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      {(product.size_stocks?.length ?? 0) >= 2 && (
                        <Button size="sm" variant="outline" title="העבר מלאי" onClick={() => {
                          setSelectedProduct(product);
                          setIsTransferDialogOpen(true);
                        }}>
                          <ArrowLeftRight className="h-4 w-4" />
                        </Button>
                      )}
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsAddToCartOpen(true);
                        }}
                        disabled={product.stock_quantity === 0}
                      >
                        <ShoppingCart className="h-4 w-4 ml-1" />
                        הוסף לסל
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
                        title="הסר מהחנות"
                        disabled={deletingProductId === product.id}
                        onClick={() => handleRemoveFromStore(product)}
                      >
                        <Trash2 className="h-4 w-4 ml-1" />
                        {deletingProductId === product.id ? 'מסיר…' : 'הסר מהחנות'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialogs */}
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

      {/* Floating cart bar */}
      {cart.length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
          <div className="flex items-center gap-4 rounded-full bg-gray-900 text-white shadow-xl px-5 py-3" dir="rtl">
            <div className="flex items-center gap-2">
              <div className="relative">
                <ShoppingCart className="h-5 w-5" />
                <span className="absolute -top-2 -right-2.5 h-5 min-w-5 px-1 rounded-full bg-teal-500 text-[11px] font-bold flex items-center justify-center">
                  {cartCount}
                </span>
              </div>
              <span className="text-sm font-semibold tabular-nums">₪{cartTotal.toFixed(2)}</span>
            </div>
            <Button
              size="sm"
              className="rounded-full bg-teal-500 hover:bg-teal-600 text-white border-0"
              onClick={() => setIsCheckoutOpen(true)}
            >
              לתשלום
            </Button>
            <button
              type="button"
              className="text-xs text-gray-300 hover:text-white transition-colors"
              onClick={() => setCart([])}
            >
              רוקן סל
            </button>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

