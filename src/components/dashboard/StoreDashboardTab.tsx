'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DollarSign, ShoppingBag, AlertTriangle, Package, Trophy, TrendingUp, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchAnalytics } from '@/lib/storeApi';
import type { StoreAnalytics } from '@/types/store';

const EMPTY: StoreAnalytics = {
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
  recent_sales: [],
};

export default function StoreDashboardTab() {
  const [analytics, setAnalytics] = useState<StoreAnalytics>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchAnalytics(days)
      .then((data) => { if (!cancelled) setAnalytics(data); })
      .catch(() => { if (!cancelled) setAnalytics(EMPTY); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (isLoading) {
    return <div className="p-8 text-gray-500">טוען נתוני חנות...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
                days === d
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {d} ימים
            </button>
          ))}
        </div>
        <Link
          href="/store/dashboard"
          className="flex items-center gap-1.5 text-sm text-teal-600 hover:text-teal-700"
        >
          <ExternalLink className="h-4 w-4" />
          דוח מלא
        </Link>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">הכנסות</p>
            <p className="text-xl font-bold text-green-600 mt-1">
              ₪{analytics.total_revenue.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
            </p>
            <DollarSign className="h-6 w-6 text-green-400 opacity-60 mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">רווח נקי</p>
            <p className="text-xl font-bold text-blue-600 mt-1">
              ₪{analytics.net_profit.toLocaleString('he-IL', { maximumFractionDigits: 0 })}
            </p>
            <TrendingUp className="h-6 w-6 text-blue-400 opacity-60 mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">מכירות</p>
            <p className="text-xl font-bold text-teal-600 mt-1">{analytics.total_sales_count}</p>
            <ShoppingBag className="h-6 w-6 text-teal-400 opacity-60 mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">שווי מלאי</p>
            <p className="text-xl font-bold text-purple-600 mt-1">
              ₪{(analytics.inventory_value ?? 0).toLocaleString('he-IL', { maximumFractionDigits: 0 })}
            </p>
            <Package className="h-6 w-6 text-purple-400 opacity-60 mt-1" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">מוצר מוביל</p>
            {analytics.top_product ? (
              <>
                <p className="text-sm font-bold text-amber-600 mt-1 truncate">{analytics.top_product.name}</p>
                <p className="text-xs text-gray-400">{analytics.top_product.quantity} יח׳</p>
              </>
            ) : (
              <p className="text-gray-400 mt-1 text-sm">—</p>
            )}
            <Trophy className="h-6 w-6 text-amber-400 opacity-60 mt-1" />
          </CardContent>
        </Card>

        <Card className={analytics.low_stock_count > 0 ? 'border-red-400' : ''}>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500">מלאי נמוך</p>
            <p className={`text-xl font-bold mt-1 ${analytics.low_stock_count > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {analytics.low_stock_count}
            </p>
            <AlertTriangle className={`h-6 w-6 opacity-60 mt-1 ${analytics.low_stock_count > 0 ? 'text-red-400' : 'text-gray-300'}`} />
          </CardContent>
        </Card>
      </div>

      {/* Trend chart */}
      {analytics.monthly_revenue.length > 1 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">מגמת הכנסות</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={analytics.monthly_revenue} margin={{ top: 5, right: 16, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `₪${Number(v).toLocaleString()}`} tick={{ fontSize: 10 }} width={60} />
                <Tooltip formatter={(value) => [`₪${Number(value).toLocaleString('he-IL', { minimumFractionDigits: 0 })}`, 'הכנסות']} />
                <Line type="monotone" dataKey="revenue" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Bottom: top products + shrinkage side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {analytics.sales_by_product.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">מכירות לפי מוצר</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>מוצר</TableHead>
                    <TableHead>כמות</TableHead>
                    <TableHead>הכנסה</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.sales_by_product.slice(0, 5).map((item, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{item.product}</TableCell>
                      <TableCell><Badge variant="outline">{item.quantity}</Badge></TableCell>
                      <TableCell className="text-teal-600">₪{item.revenue.toLocaleString('he-IL', { maximumFractionDigits: 0 })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {analytics.shrinkage_by_reason && analytics.shrinkage_by_reason.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base text-orange-600">📉 הפחת</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>סיבה</TableHead>
                    <TableHead>יחידות</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analytics.shrinkage_by_reason.map((row) => (
                    <TableRow key={row.reason}>
                      <TableCell className="font-medium">{row.reason_label}</TableCell>
                      <TableCell><Badge variant="destructive">{row.total_units}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
