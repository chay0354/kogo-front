'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, DollarSign, ShoppingBag, AlertTriangle, Package, Trophy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { CardGridSkeleton, Skeleton, StatCardsSkeleton } from '@/components/ui/skeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { fetchAnalytics } from '@/lib/storeApi';
import { getProductStockLocationLabels } from '@/lib/storeProductDisplay';
import api from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { filterBranchesForUser, unwrapApiList } from '@/lib/scopedFilters';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { StoreAnalytics } from '@/types/store';
import type { Branch } from '@/types/branch';

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

  const cities = useMemo(() => {
    const map = new Map<string, string>();
    branches.forEach((b) => {
      if (b.city && b.city_name) {
        map.set(b.city, b.city_name);
      }
    });
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'he'));
  }, [branches]);

  const branchesForFilter = useMemo(() => {
    if (selectedCity === 'all') return branches;
    return branches.filter((b) => b.city === selectedCity);
  }, [branches, selectedCity]);

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
      console.log('Analytics data loaded:', data); // Debug log
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
      <>
        <div className="p-6 space-y-6" aria-busy="true" aria-label="טוען דוחות תנועה">
          <Skeleton className="h-9 w-40" />
          <StatCardsSkeleton
            cards={4}
            gridClassName="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
          />
          <CardGridSkeleton
            cards={2}
            gridClassName="grid grid-cols-1 lg:grid-cols-2 gap-6"
            cardClassName="h-72"
          />
        </div>
      </>
    );
  }

  const COLORS = ['#14b8a6', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold">דוחות תנועה</h1>
          <p className="text-gray-600 mt-1">סטטיסטיקות מכירות ומלאי</p>
        </div>
        <Link href="/store">
          <Button variant="outline">
            <ArrowLeft className="ml-2 h-4 w-4" />
            חזרה לחנות
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:max-w-2xl">
            <div>
              <label htmlFor="dashboard-city" className="block text-xs font-medium text-gray-500 mb-1">
                עיר
              </label>
              <Select
                id="dashboard-city"
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
            <div>
              <label htmlFor="dashboard-branch" className="block text-xs font-medium text-gray-500 mb-1">
                סניף
              </label>
              <Select
                id="dashboard-branch"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-full h-10 text-sm"
              >
                <option value="all">כל הסניפים</option>
                <option value="delivery">משלוח</option>
                {branchesForFilter.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label htmlFor="dashboard-days" className="block text-xs font-medium text-gray-500 mb-1">
                תקופה
              </label>
              <Select
                id="dashboard-days"
                value={String(days)}
                onChange={(e) => setDays(parseInt(e.target.value))}
                className="w-full h-10 text-sm"
              >
                <option value="7">7 ימים אחרונים</option>
                <option value="30">30 ימים אחרונים</option>
                <option value="90">90 ימים אחרונים</option>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards — row 1: revenue, profit, sales, low stock */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">סה"כ הכנסות</p>
                <p className="text-3xl font-bold text-green-600 mt-2">
                  ₪{analytics.total_revenue.toLocaleString()}
                </p>
              </div>
              <DollarSign className="h-12 w-12 text-green-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">רווח נקי</p>
                <p className="text-3xl font-bold text-blue-600 mt-2">
                  ₪{analytics.net_profit.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="h-12 w-12 text-blue-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">מכירות</p>
                <p className="text-3xl font-bold text-teal-600 mt-2">
                  {analytics.total_sales_count}
                </p>
              </div>
              <ShoppingBag className="h-12 w-12 text-teal-500 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card
          role="button"
          tabIndex={0}
          aria-label="הצג מוצרים במלאי נמוך"
          onClick={() => {
            if (analytics.low_stock_count > 0) setIsLowStockDialogOpen(true);
          }}
          onKeyDown={(e) => {
            if ((e.key === 'Enter' || e.key === ' ') && analytics.low_stock_count > 0) {
              e.preventDefault();
              setIsLowStockDialogOpen(true);
            }
          }}
          className={`transition-shadow ${
            analytics.low_stock_count > 0
              ? 'border-red-500 cursor-pointer hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500'
              : 'cursor-default'
          }`}
        >
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">מלאי נמוך</p>
                <p className="text-3xl font-bold text-red-600 mt-2">
                  {analytics.low_stock_count}
                </p>
                {analytics.low_stock_count > 0 && (
                  <p className="text-xs text-red-500 mt-1">לחץ לצפייה במוצרים</p>
                )}
              </div>
              <AlertTriangle className={`h-12 w-12 ${analytics.low_stock_count > 0 ? 'text-red-500' : 'text-gray-400'} opacity-80`} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Cards — row 2: inventory value, top product */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">שווי מלאי נוכחי</p>
                <p className="text-3xl font-bold text-purple-600 mt-2">
                  ₪{(analytics.inventory_value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs text-gray-400 mt-1">לפי מחיר מכירה × כמות במלאי</p>
              </div>
              <Package className="h-12 w-12 text-purple-400 opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">מוצר מוביל</p>
                {analytics.top_product ? (
                  <>
                    <p className="text-xl font-bold text-amber-600 mt-2">{analytics.top_product.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{analytics.top_product.quantity} יחידות בתקופה</p>
                  </>
                ) : (
                  <p className="text-gray-400 mt-2">אין מכירות בתקופה</p>
                )}
              </div>
              <Trophy className="h-12 w-12 text-amber-400 opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Low Stock Products Dialog */}
      <Dialog open={isLowStockDialogOpen} onOpenChange={setIsLowStockDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto p-6">
          <DialogHeader>
            <div className="flex items-center justify-between gap-4">
              <DialogTitle className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                מוצרים במלאי נמוך ({analytics.low_stock_count})
              </DialogTitle>
              <DialogCloseButton />
            </div>
          </DialogHeader>

          <div className="mt-4">
            {analytics.low_stock_products && analytics.low_stock_products.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מוצר</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead>סניף</TableHead>
                    <TableHead>מלאי נוכחי</TableHead>
                    <TableHead>מינימום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.low_stock_products.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="max-w-[14rem]">
                        <div className="flex flex-col gap-0.5 text-sm leading-snug">
                          {getProductStockLocationLabels(product, null).map((label, i) => (
                            <span key={`${product.id}-loc-${i}`}>{label}</span>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="destructive">{product.stock_quantity}</Badge>
                      </TableCell>
                      <TableCell>{product.min_stock_alert}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-gray-500 text-center py-8">אין מוצרים במלאי נמוך</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Link href="/store?stock=low">
                <Button variant="outline">פתח את החנות</Button>
              </Link>
              <Button onClick={() => setIsLowStockDialogOpen(false)}>סגור</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trend Chart — revenue over time */}
      <Card>
        <CardHeader>
          <CardTitle>מגמת הכנסות לאורך זמן</CardTitle>
        </CardHeader>
        <CardContent>
          {analytics.monthly_revenue && analytics.monthly_revenue.length > 1 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={analytics.monthly_revenue} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={(v) => `₪${v.toLocaleString()}`} tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(value) => [`₪${Number(value).toLocaleString('he-IL', { minimumFractionDigits: 0 })}`, 'הכנסות']} />
                <Line type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-gray-500 text-center py-12">אין מספיק נתונים להצגת מגמה</p>
          )}
        </CardContent>
      </Card>

      {/* Shrinkage by reason */}
      {analytics.shrinkage_by_reason && analytics.shrinkage_by_reason.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-orange-600">📉 נתוני הפחת</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>סיבה</TableHead>
                  <TableHead>יחידות שנגרעו</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.shrinkage_by_reason.map((row) => (
                  <TableRow key={row.reason}>
                    <TableCell className="font-medium">{row.reason_label}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{row.total_units}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Revenue */}
        <Card>
          <CardHeader>
            <CardTitle>הכנסות חודשיות</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.monthly_revenue && analytics.monthly_revenue.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">חודש</TableHead>
                      <TableHead className="text-left">הכנסות (₪)</TableHead>
                      <TableHead className="text-left">אחוז מהמקסימום</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.monthly_revenue.slice(-6).map((item, index) => {
                      const maxRevenue = Math.max(...analytics.monthly_revenue.map(m => m.revenue));
                      const percentage = ((item.revenue / maxRevenue) * 100).toFixed(0);
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{item.month}</TableCell>
                          <TableCell className="text-teal-600 font-semibold">
                            ₪{item.revenue.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                                <div
                                  className="bg-teal-500 h-2 rounded-full"
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                              <span className="text-sm text-gray-600 w-10">{percentage}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-20">אין נתונים להצגה</p>
            )}
          </CardContent>
        </Card>

        {/* Sales by Product */}
        <Card>
          <CardHeader>
            <CardTitle>מכירות לפי מוצר</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.sales_by_product && analytics.sales_by_product.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">מוצר</TableHead>
                      <TableHead className="text-left">כמות</TableHead>
                      <TableHead className="text-left">סכום (₪)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {analytics.sales_by_product.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.product}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-semibold">
                            {item.quantity} יח׳
                          </Badge>
                        </TableCell>
                        <TableCell className="text-blue-600 font-semibold">
                          ₪{item.revenue?.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || '0.00'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-20">אין נתונים להצגה</p>
            )}
          </CardContent>
        </Card>

        {/* Sales by Category */}
        <Card>
          <CardHeader>
            <CardTitle>מכירות לפי קטגוריה</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {analytics.sales_by_category && analytics.sales_by_category.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {analytics.sales_by_category.map((item, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm font-medium">{item.category}</span>
                      </div>
                      <p className="text-xl font-bold">₪{item.total.toFixed(0)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-20">אין נתונים להצגה</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Sales by Payment Method */}
        <Card>
          <CardHeader>
            <CardTitle>מכירות לפי אמצעי תשלום</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {analytics.sales_by_payment_method && analytics.sales_by_payment_method.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {analytics.sales_by_payment_method.map((item, index) => (
                    <div key={index} className="bg-gray-50 p-3 rounded-lg">
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: COLORS[index % COLORS.length] }}
                        />
                        <span className="text-sm font-medium">{item.method}</span>
                      </div>
                      <p className="text-xl font-bold">₪{item.total.toFixed(0)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-20">אין נתונים להצגה</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Low Stock Products */}
        {analytics.low_stock_products && analytics.low_stock_products.length > 0 && (
          <Card className="border-red-500">
            <CardHeader>
              <CardTitle className="text-red-600">מוצרים במלאי נמוך</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מוצר</TableHead>
                    <TableHead>קטגוריה</TableHead>
                    <TableHead>מלאי נוכחי</TableHead>
                    <TableHead>מינימום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.low_stock_products.map(product => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell>
                        <Badge className="bg-red-100 text-red-800">{product.stock_quantity}</Badge>
                      </TableCell>
                      <TableCell>{product.min_stock_alert}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle>מכירות אחרונות</CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.recent_sales && analytics.recent_sales.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>תאריך</TableHead>
                    <TableHead>רוכש</TableHead>
                    <TableHead>מוצר</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>סכום</TableHead>
                    <TableHead>תשלום</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.recent_sales.map(sale => (
                    <TableRow key={sale.id}>
                      <TableCell className="text-sm">
                        {new Date(sale.sale_date).toLocaleDateString('he-IL')}
                      </TableCell>
                      <TableCell className="font-medium text-teal-600">
                        {sale.child_name || 'לקוח מזדמן'}
                      </TableCell>
                      <TableCell className="font-medium">{sale.product_name}</TableCell>
                      <TableCell>{sale.quantity}</TableCell>
                      <TableCell className="font-bold">₪{sale.total_price}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {sale.payment_method === 'credit_card' ? 'אשראי' :
                           sale.payment_method === 'cash' ? 'מזומן' : 'הוראת קבע'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-12">
                <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">אין מכירות להצגה</p>
                <p className="text-sm text-gray-400 mt-2">מכירות יופיעו כאן לאחר ביצוע רכישות</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>
    </>
  );
}

