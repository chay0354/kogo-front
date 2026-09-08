'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle, ShoppingBag } from 'lucide-react';
import { CardGridSkeleton, Skeleton, StatCardsSkeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { fetchAnalytics } from '@/lib/storeApi';
import { getProductStockLocationLabels } from '@/lib/storeProductDisplay';
import api from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import {
  citiesFromBranches,
  filterBranchesByCity,
  filterBranchesForUser,
  unwrapApiList,
} from '@/lib/scopedFilters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StoreAnalytics } from '@/types/store';
import type { Branch } from '@/types/branch';
import theme from '@/components/dashboard/theme/dashboard.module.css';
import styles from '../store.module.css';

/** ₪ with no decimals, matching the dashboard's own formatter. */
function shekel(value: number | null | undefined): string {
  return `₪${Number(value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

/** ₪ with agorot — used where the figure is a single transaction. */
function shekelExact(value: number | null | undefined): string {
  return `₪${Number(value ?? 0).toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const PAYMENT_LABELS: Record<string, string> = {
  credit_card: 'אשראי',
  cash: 'מזומן',
  monthly_billing: 'הוראת קבע',
};

export default function StoreDashboard() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLowStockDialogOpen, setIsLowStockDialogOpen] = useState(false);

  useEffect(() => {
    if (user) loadBranches();
  }, [user?.id]);

  useEffect(() => {
    loadAnalytics();
  }, [days, selectedCity, selectedBranch]);

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

  async function loadBranches() {
    try {
      const branchesResponse = await api.get('/core/branches/');
      const branchList = branchesResponse.data?.results || branchesResponse.data;
      setBranches(
        filterBranchesForUser(
          unwrapApiList<Branch>(branchList),
          user,
        ),
      );
    } catch (error) {
      console.error('Error loading branches:', error);
      setBranches([]);
    }
  }

  async function loadAnalytics() {
    setIsLoading(true);
    try {
      const data = await fetchAnalytics({
        days,
        branch: selectedBranch,
        city: selectedBranch === 'all' || selectedBranch === 'delivery' ? selectedCity : undefined,
      });
      setAnalytics(data);
    } catch (error) {
      console.error('Error loading analytics:', error);
      // Set empty analytics to prevent render errors
      setAnalytics({
        total_revenue: 0,
        net_profit: 0,
        total_sales_count: 0,
        low_stock_count: 0,
        inventory_value: 0,
        top_product: null,
        shrinkage_by_reason: [],
        monthly_revenue: [],
        sales_by_product: [],
        sales_by_category: [],
        sales_by_branch: [],
        sales_by_payment_method: [],
        low_stock_products: [],
        recent_sales: []
      } as StoreAnalytics);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading || !analytics) {
    return (
      <div dir="rtl" className={`${theme.tokens} p-4 sm:p-6 space-y-5`} aria-busy="true" aria-label="טוען דוחות תנועה">
        <Skeleton className="h-9 w-40" />
        <StatCardsSkeleton
          cards={4}
          gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3"
        />
        <CardGridSkeleton
          cards={2}
          gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-4"
          cardClassName="h-72"
        />
      </div>
    );
  }

  const revenue = Number(analytics.total_revenue ?? 0);
  const profit = Number(analytics.net_profit ?? 0);
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

  const salesByProduct = analytics.sales_by_product ?? [];
  const maxProductRevenue = Math.max(...salesByProduct.map((p) => Number(p.revenue) || 0), 1);

  const byCategory = analytics.sales_by_category ?? [];
  const maxCategory = Math.max(...byCategory.map((c) => Number(c.total) || 0), 1);

  const byPayment = analytics.sales_by_payment_method ?? [];
  const maxPayment = Math.max(...byPayment.map((p) => Number(p.total) || 0), 1);

  const monthly = analytics.monthly_revenue ?? [];
  const maxMonthly = Math.max(...monthly.map((m) => Number(m.revenue) || 0), 1);
  const trend = monthly.map((r) => ({ month: r.month, revenue: Number(r.revenue ?? 0) }));

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
            <h1 className={theme.phTitle}>דוחות תנועה</h1>
            <p className={theme.phSub}>סטטיסטיקות מכירות ומלאי</p>
          </div>
          <div className={styles.headActions}>
            <Link href="/store" className={styles.action}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              חזרה לחנות
            </Link>
          </div>
        </header>

        {/* ---- filters ---- */}
        <div className={theme.card}>
          <div className={styles.toolbar} style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            <div className={styles.field}>
              <label htmlFor="dashboard-city" className={styles.fieldLabel}>עיר</label>
              <select
                id="dashboard-city"
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
              <label htmlFor="dashboard-branch" className={styles.fieldLabel}>סניף</label>
              <select
                id="dashboard-branch"
                className={styles.control}
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="all">כל הסניפים</option>
                <option value="delivery">משלוח</option>
                {branchesForFilter.map((branch) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label htmlFor="dashboard-days" className={styles.fieldLabel}>תקופה</label>
              <select
                id="dashboard-days"
                className={styles.control}
                value={String(days)}
                onChange={(e) => setDays(parseInt(e.target.value))}
              >
                <option value="7">7 ימים אחרונים</option>
                <option value="30">30 ימים אחרונים</option>
                <option value="90">90 ימים אחרונים</option>
              </select>
            </div>
          </div>
        </div>

        {/* ---- headline ---- */}
        <div className={`${theme.hero} ${theme.mt}`}>
          <div className={theme.heroLbl}>סה"כ הכנסות בתקופה</div>
          <div className={theme.heroBig}>{shekel(revenue)}</div>
          <div className={theme.heroRow}>
            <div>
              <span>רווח נקי</span>
              <b>{shekel(profit)}</b>
            </div>
            <div>
              <span>שיעור רווח</span>
              <b>{revenue > 0 ? `${margin.toFixed(1)}%` : '—'}</b>
            </div>
            <div>
              <span>מכירות</span>
              <b>{Number(analytics.total_sales_count ?? 0)}</b>
            </div>
          </div>
        </div>

        {/* ---- KPIs ---- */}
        <div className={`${theme.grid} ${theme.g4} ${theme.mt} ${styles.kpiGrid}`}>
          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>רווח נקי</div>
            <div className={`${theme.kpiVal} ${profit > 0 ? theme.up : profit < 0 ? theme.down : ''}`}>
              {shekel(profit)}
            </div>
            <div className={theme.kpiFoot}>הכנסות בניכוי עלות</div>
          </div>

          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>מכירות</div>
            <div className={theme.kpiVal}>{Number(analytics.total_sales_count ?? 0)}</div>
            <div className={theme.kpiFoot}>עסקאות בתקופה</div>
          </div>

          <div className={theme.kpi}>
            <div className={theme.kpiLbl}>שווי מלאי נוכחי</div>
            <div className={theme.kpiVal}>{shekel(analytics.inventory_value)}</div>
            <div className={theme.kpiFoot}>לפי מחיר מכירה × כמות</div>
          </div>

          {/* Pressing it opens the list behind the number. */}
          <button
            type="button"
            className={`${theme.kpi} ${analytics.low_stock_count > 0 ? styles.kpiButton : ''}`}
            aria-label="הצג מוצרים במלאי נמוך"
            disabled={analytics.low_stock_count === 0}
            onClick={() => {
              if (analytics.low_stock_count > 0) setIsLowStockDialogOpen(true);
            }}
          >
            <div className={theme.kpiLbl}>מלאי נמוך</div>
            <div className={`${theme.kpiVal} ${analytics.low_stock_count > 0 ? theme.down : ''}`}>
              {analytics.low_stock_count}
            </div>
            <div className={theme.kpiFoot}>
              {analytics.low_stock_count > 0 ? 'לחצו לצפייה במוצרים' : 'הכול מעל הסף'}
            </div>
          </button>
        </div>

        {/* ---- top product ---- */}
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מוצר מוביל</h2>
          <p className={theme.cardSub}>הנמכר ביותר בתקופה שנבחרה</p>
          {analytics.top_product ? (
            <div className={theme.counts} style={{ marginTop: 0 }}>
              <div>
                <b>{analytics.top_product.name}</b>
                <span>המוצר</span>
              </div>
              <div>
                <b>{analytics.top_product.quantity}</b>
                <span>יחידות נמכרו</span>
              </div>
            </div>
          ) : (
            <p className={theme.note}>אין מכירות בתקופה</p>
          )}
        </div>

        {/* ---- revenue trend ---- */}
        {trend.length > 1 ? (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>מגמת הכנסות לאורך זמן</h2>
            <p className={theme.cardSub}>הכנסות החנות לפי חודש</p>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => shekel(Number(v))} tick={{ fontSize: 11 }} width={78} />
                  <Tooltip formatter={(value) => [shekel(Number(value)), 'הכנסות']} />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    name="הכנסות"
                    stroke="hsl(var(--success))"
                    strokeWidth={2.5}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>מגמת הכנסות לאורך זמן</h2>
            <p className={theme.cardSub}>
              {trend.length === 1 ? `${trend[0].month} · בחרו טווח רחב יותר כדי לראות מגמה` : 'אין מספיק נתונים להצגת מגמה'}
            </p>
            {trend.length === 1 && (
              <div className={theme.counts} style={{ marginTop: 0 }}>
                <div>
                  <b className={theme.up}>{shekel(trend[0].revenue)}</b>
                  <span>הכנסות</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---- sales by product ---- */}
        {salesByProduct.length > 0 && (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>מכירות לפי מוצר</h2>
            <p className={theme.cardSub}>הכנסה לכל מוצר בתקופה</p>
            {salesByProduct.map((item, i, arr) => (
              <div
                className={theme.hbar}
                key={`${item.product}-${i}`}
                style={i === arr.length - 1 ? { marginBottom: 0 } : undefined}
              >
                <div className={theme.hbarName}>{item.product}</div>
                <div className={theme.hbarNum}>
                  {shekelExact(item.revenue)} · {Number(item.quantity ?? 0)} יח׳
                </div>
                <div className={theme.track}>
                  <div
                    className={theme.fill}
                    style={{ width: `${((Number(item.revenue) || 0) / maxProductRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ---- category / payment ---- */}
        <div className={`${theme.grid} ${theme.g2} ${theme.mt}`}>
          <div className={theme.card}>
            <h2 className={theme.cardTitle}>מכירות לפי קטגוריה</h2>
            <p className={theme.cardSub}>לאן הולך הכסף</p>
            {byCategory.length > 0 ? (
              byCategory.map((item, i, arr) => (
                <div
                  className={theme.hbar}
                  key={`${item.category}-${i}`}
                  style={i === arr.length - 1 ? { marginBottom: 0 } : undefined}
                >
                  <div className={theme.hbarName}>{item.category}</div>
                  <div className={theme.hbarNum}>{shekel(item.total)}</div>
                  <div className={theme.track}>
                    <div
                      className={theme.fill}
                      style={{ width: `${((Number(item.total) || 0) / maxCategory) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className={theme.note}>אין נתונים להצגה</p>
            )}
          </div>

          <div className={theme.card}>
            <h2 className={theme.cardTitle}>מכירות לפי אמצעי תשלום</h2>
            <p className={theme.cardSub}>איך שילמו</p>
            {byPayment.length > 0 ? (
              byPayment.map((item, i, arr) => (
                <div
                  className={theme.hbar}
                  key={`${item.method}-${i}`}
                  style={i === arr.length - 1 ? { marginBottom: 0 } : undefined}
                >
                  <div className={theme.hbarName}>{item.method}</div>
                  <div className={theme.hbarNum}>{shekel(item.total)}</div>
                  <div className={theme.track}>
                    <div
                      className={`${theme.fill} ${theme.fillAmber}`}
                      style={{ width: `${((Number(item.total) || 0) / maxPayment) * 100}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <p className={theme.note}>אין נתונים להצגה</p>
            )}
          </div>
        </div>

        {/* ---- monthly table ---- */}
        {monthly.length > 0 && (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>הכנסות חודשיות</h2>
            <p className={theme.cardSub}>ששת החודשים האחרונים</p>
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>חודש</th>
                    <th className={theme.n}>הכנסות</th>
                    <th className={theme.n}>אחוז מהמקסימום</th>
                  </tr>
                </thead>
                <tbody>
                  {monthly.slice(-6).map((item, index) => {
                    const percentage = ((Number(item.revenue) / maxMonthly) * 100).toFixed(0);
                    return (
                      <tr key={index}>
                        <td className={theme.name}>{item.month}</td>
                        <td className={theme.n}>{shekelExact(item.revenue)}</td>
                        <td className={theme.n}>
                          {percentage}%
                          <span className={theme.mini}>
                            <i style={{ width: `${percentage}%` }} />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- shrinkage ---- */}
        {analytics.shrinkage_by_reason && analytics.shrinkage_by_reason.length > 0 && (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>נתוני הפחת</h2>
            <p className={theme.cardSub}>יחידות שיצאו מהמלאי שלא במכירה</p>
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>סיבה</th>
                    <th className={theme.n}>יחידות שנגרעו</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.shrinkage_by_reason.map((row) => (
                    <tr key={row.reason}>
                      <td className={theme.name}>{row.reason_label}</td>
                      <td className={theme.n}>
                        <span className={`${theme.tag} ${theme.tagLow}`}>{row.total_units}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- low stock ---- */}
        {analytics.low_stock_products && analytics.low_stock_products.length > 0 && (
          <div className={`${theme.card} ${theme.mt}`}>
            <h2 className={theme.cardTitle}>מוצרים במלאי נמוך</h2>
            <p className={theme.cardSub}>מתחת לסף שהוגדר לכל מוצר</p>
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>מוצר</th>
                    <th>קטגוריה</th>
                    <th className={theme.n}>מלאי נוכחי</th>
                    <th className={theme.n}>מינימום</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.low_stock_products.map((product) => (
                    <tr key={product.id}>
                      <td className={theme.name}>{product.name}</td>
                      <td>
                        <span className={`${theme.tag} ${theme.tagType}`}>{product.category}</span>
                      </td>
                      <td className={theme.n}>
                        <span className={`${theme.tag} ${theme.tagLow}`}>{product.stock_quantity}</span>
                      </td>
                      <td className={theme.n}>{product.min_stock_alert}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---- recent sales ---- */}
        <div className={`${theme.card} ${theme.mt}`}>
          <h2 className={theme.cardTitle}>מכירות אחרונות</h2>
          <p className={theme.cardSub}>העסקאות האחרונות בתקופה</p>
          {analytics.recent_sales && analytics.recent_sales.length > 0 ? (
            <div className={theme.tableScroll}>
              <table className={theme.table}>
                <thead>
                  <tr>
                    <th>תאריך</th>
                    <th>רוכש</th>
                    <th>מוצר</th>
                    <th className={theme.n}>כמות</th>
                    <th className={theme.n}>סכום</th>
                    <th>תשלום</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics.recent_sales.map((sale) => (
                    <tr key={sale.id}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--kg-muted)', fontSize: 12 }}>
                        {new Date(sale.sale_date).toLocaleDateString('he-IL')}
                      </td>
                      <td className={theme.name}>{sale.child_name || 'לקוח מזדמן'}</td>
                      <td>{sale.product_name}</td>
                      <td className={theme.n}>{sale.quantity}</td>
                      <td className={theme.n}>{shekelExact(sale.total_price)}</td>
                      <td>
                        <span className={`${theme.tag} ${theme.tagType}`}>
                          {PAYMENT_LABELS[sale.payment_method] ?? sale.payment_method}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.empty}>
              <ShoppingBag className={`${styles.emptyIcon} h-12 w-12`} aria-hidden="true" />
              <p className={styles.emptyTitle}>אין מכירות להצגה</p>
              <p className={styles.emptyText}>מכירות יופיעו כאן לאחר ביצוע רכישות</p>
            </div>
          )}
        </div>

        {/* ---- low stock dialog ---- */}
        <Dialog open={isLowStockDialogOpen} onOpenChange={setIsLowStockDialogOpen}>
          <DialogContent className="max-w-3xl p-5 sm:p-6">
            <DialogHeader>
              <div className="flex items-center justify-between gap-4">
                <DialogTitle className="text-lg">
                  <span className="flex items-center gap-2" style={{ color: '#c93b40' }}>
                    <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                    מוצרים במלאי נמוך ({analytics.low_stock_count})
                  </span>
                </DialogTitle>
                <DialogCloseButton />
              </div>
            </DialogHeader>

            <div className={theme.scope} style={{ marginTop: 16 }}>
              {analytics.low_stock_products && analytics.low_stock_products.length > 0 ? (
                <div className={theme.tableScroll} style={{ margin: 0, padding: 0 }}>
                  <table className={theme.table}>
                    <thead>
                      <tr>
                        <th>מוצר</th>
                        <th>קטגוריה</th>
                        <th>סניף</th>
                        <th className={theme.n}>מלאי</th>
                        <th className={theme.n}>מינימום</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.low_stock_products.map((product) => (
                        <tr key={product.id}>
                          <td className={theme.name}>{product.name}</td>
                          <td>
                            <span className={`${theme.tag} ${theme.tagType}`}>{product.category}</span>
                          </td>
                          <td>
                            <div className={styles.locList}>
                              {getProductStockLocationLabels(product, null).map((label, i) => (
                                <span key={`${product.id}-loc-${i}`}>{label}</span>
                              ))}
                            </div>
                          </td>
                          <td className={theme.n}>
                            <span className={`${theme.tag} ${theme.tagLow}`}>{product.stock_quantity}</span>
                          </td>
                          <td className={theme.n}>{product.min_stock_alert}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={theme.note} style={{ textAlign: 'center', padding: '24px 0' }}>
                  אין מוצרים במלאי נמוך
                </p>
              )}

              <div className={styles.headActions} style={{ justifyContent: 'flex-end', marginTop: 20 }}>
                <Link href="/store?stock=low" className={styles.action}>
                  פתח את החנות
                </Link>
                <button
                  type="button"
                  className={`${styles.action} ${styles.actionPrimary}`}
                  onClick={() => setIsLowStockDialogOpen(false)}
                >
                  סגור
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </>
    </div>
  );
}
