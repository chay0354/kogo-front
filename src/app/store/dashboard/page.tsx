'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, TrendingUp, DollarSign, ShoppingBag, AlertTriangle } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { fetchAnalytics } from '@/lib/storeApi';
import { getProductStockLocationLabels } from '@/lib/storeProductDisplay';
import type { StoreAnalytics } from '@/types/store';

export default function StoreDashboard() {
  const [analytics, setAnalytics] = useState<StoreAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [isLowStockDialogOpen, setIsLowStockDialogOpen] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [days]);

  async function loadAnalytics() {
    setIsLoading(true);
    try {
      const data = await fetchAnalytics(days);
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
        monthly_revenue: [],
        sales_by_product: [],
        sales_by_category: [],
        sales_by_branch: [],
        sales_by_payment_method: [],
        low_stock_products: [],
        recent_sales: []
      });
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading || !analytics) {
    return (
      <AppLayout>
        <div className="p-8">טוען...</div>
      </AppLayout>
    );
  }

  const COLORS = ['#14b8a6', '#06b6d4', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">דוחות תנועה</h1>
          <p className="text-gray-600">סטטיסטיקות מכירות ומלאי</p>
        </div>
        <div className="flex gap-3">
          <select 
            value={days} 
            onChange={(e) => setDays(parseInt(e.target.value))}
            className="border rounded-md px-3 py-2"
          >
            <option value="7">7 ימים אחרונים</option>
            <option value="30">30 ימים אחרונים</option>
            <option value="90">90 ימים אחרונים</option>
          </select>
          <Link href="/store">
            <Button variant="outline">
              <ArrowLeft className="ml-2 h-4 w-4" />
              חזרה לחנות
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
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
    </AppLayout>
  );
}

