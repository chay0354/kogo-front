'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Package, ShoppingCart, TrendingUp, AlertTriangle, Plus, Search, Edit, RefreshCw, X, ArrowUpDown } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { fetchProducts } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreProduct } from '@/types/store';
import type { Branch } from '@/types/branch';
import AddProductDialog from '@/components/store/AddProductDialog';
import EditProductDialog from '@/components/store/EditProductDialog';
import UpdateStockDialog from '@/components/store/UpdateStockDialog';
import PurchaseDialog from '@/components/store/PurchaseDialog';

export default function StorePage() {
  const router = useRouter();
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [sortField, setSortField] = useState<'name' | 'sale_price' | 'stock_quantity'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isStockDialogOpen, setIsStockDialogOpen] = useState(false);
  const [isPurchaseDialogOpen, setIsPurchaseDialogOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<StoreProduct | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    try {
      const [productsData, branchesResponse] = await Promise.all([
        fetchProducts(),
        api.get('/core/branches/')
      ]);
      
      // Handle paginated responses
      const products = (productsData as any)?.results || productsData;
      const branches = branchesResponse.data?.results || branchesResponse.data;
      
      setProducts(Array.isArray(products) ? products : []);
      setBranches(Array.isArray(branches) ? branches : []);
    } catch (error) {
      console.error('Error loading data:', error);
      setProducts([]);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }

  // Calculate KPIs
  const totalProducts = products.length;
  const totalStock = products.reduce((sum, p) => sum + p.stock_quantity, 0);
  const inventoryValue = products.reduce((sum, p) => sum + (p.stock_quantity * p.sale_price), 0);
  const lowStockProducts = products.filter(p => p.is_low_stock);

  // Filter and sort products
  const filteredAndSortedProducts = products
    .filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           product.category.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesBranch = selectedBranch === 'all' ||
                           (selectedBranch === 'delivery' ? !product.branch : product.branch === selectedBranch);
      const matchesStock = stockFilter === 'all' ||
                          (stockFilter === 'low' && product.is_low_stock) ||
                          (stockFilter === 'normal' && !product.is_low_stock);
      return matchesSearch && matchesBranch && matchesStock;
    })
    .sort((a, b) => {
      const modifier = sortOrder === 'asc' ? 1 : -1;
      if (sortField === 'name') return a.name.localeCompare(b.name) * modifier;
      if (sortField === 'sale_price') return (a.sale_price - b.sale_price) * modifier;
      if (sortField === 'stock_quantity') return (a.stock_quantity - b.stock_quantity) * modifier;
      return 0;
    });

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
    setSelectedBranch('all');
    setStockFilter('all');
  }

  const hasFilters = searchQuery || selectedBranch !== 'all' || stockFilter !== 'all';

  if (isLoading) {
    return (
      <AppLayout>
        <div className="p-8">טוען...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">חנות</h1>
          <p className="text-gray-600">ניהול מוצרים ומכירות</p>
        </div>
        <div className="flex gap-3">
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
          <div className="space-y-3">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="חיפוש מוצר..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10 h-9"
              />
            </div>
            
            {/* Filter Options */}
            <div className="flex gap-2 items-center">
              <Select 
                value={selectedBranch} 
                onChange={(e) => setSelectedBranch(e.target.value)}
                className="w-32 h-9 text-sm"
              >
                <option value="all">כל המיקומים</option>
                <option value="delivery">משלוח</option>
                {Array.isArray(branches) && branches.map((branch: any) => (
                  <option key={branch.id} value={branch.id}>{branch.name}</option>
                ))}
              </Select>
              <Select 
                value={stockFilter} 
                onChange={(e) => setStockFilter(e.target.value)}
                className="w-32 h-9 text-sm"
              >
                <option value="all">כל המלאי</option>
                <option value="low">מלאי נמוך</option>
                <option value="normal">מלאי תקין</option>
              </Select>
              {hasFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters} className="h-9 px-3">
                  <X className="h-4 w-4 ml-1" />
                  נקה
                </Button>
              )}
            </div>
          </div>
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
                      <Badge className="mt-1">{product.category}</Badge>
                    </div>
                  </TableCell>
                  <TableCell>{product.size || '-'}</TableCell>
                  <TableCell>₪{product.cost_price}</TableCell>
                  <TableCell className="text-teal-600 font-medium">₪{product.sale_price}</TableCell>
                  <TableCell>{product.branch_name || 'משלוח'}</TableCell>
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
                      <Button size="sm" variant="outline" onClick={() => {
                        setSelectedProduct(product);
                        setIsStockDialogOpen(true);
                      }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={() => {
                          setSelectedProduct(product);
                          setIsPurchaseDialogOpen(true);
                        }}
                        disabled={product.stock_quantity === 0}
                      >
                        <ShoppingCart className="h-4 w-4 ml-1" />
                        מכירה
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
      <UpdateStockDialog
        isOpen={isStockDialogOpen}
        onClose={() => {
          setIsStockDialogOpen(false);
          setSelectedProduct(null);
        }}
        product={selectedProduct}
        onSuccess={loadData}
      />
      {selectedProduct && (
        <PurchaseDialog
          isOpen={isPurchaseDialogOpen}
          onClose={() => {
            setIsPurchaseDialogOpen(false);
            setSelectedProduct(null);
          }}
          product={selectedProduct}
          onSuccess={loadData}
        />
      )}
      </div>
    </AppLayout>
  );
}

