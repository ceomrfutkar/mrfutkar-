import React, { useState, useEffect, useRef } from 'react';
import { AdminClient } from '../../services/adminClient';
import { Product, ProductImageMetadata } from '../../types/product';
import {
  Search,
  Plus,
  Filter,
  Eye,
  Edit2,
  Trash2,
  Image as ImageIcon,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowUpDown,
  Star,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  RefreshCw,
  X,
  Layers,
} from 'lucide-react';

export const AdminProductsScreen: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, Filter & Pagination States (IMG-07, IMG-08, IMG-09)
  const [search, setSearch] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [lowStockFilter, setLowStockFilter] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [activeImageProduct, setActiveImageProduct] = useState<Product | null>(null);

  // Notifications
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadProducts = async () => {
    setLoading(true);
    setError(null);
    try {
      const activeParam =
        statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined;

      const res = await AdminClient.fetchProducts({
        search: search.trim() || undefined,
        brandId: brandFilter || undefined,
        categoryId: categoryFilter || undefined,
        active: activeParam,
        lowStock: lowStockFilter ? true : undefined,
        page,
        pageSize,
      });

      if (res.success && Array.isArray(res.products)) {
        setProducts(res.products);
        setTotalPages(res.totalPages || 1);
        setTotalCount(res.totalCount || 0);
      } else {
        setError(res.message || 'Failed to load products.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProducts();
  }, [search, brandFilter, categoryFilter, statusFilter, lowStockFilter, page]);

  // Activate / Deactivate (IMG-05, IMG-06)
  const handleToggleActive = async (product: Product) => {
    const isCurrentlyActive = product.isActive !== false;
    try {
      if (isCurrentlyActive) {
        const res = await AdminClient.deactivateProduct(product.productId);
        if (res.success) {
          showToast(`'${product.productName}' deactivated successfully.`);
          loadProducts();
        } else {
          showToast(res.message || 'Failed to deactivate product', 'error');
        }
      } else {
        const res = await AdminClient.activateProduct(product.productId);
        if (res.success) {
          showToast(`'${product.productName}' activated successfully.`);
          loadProducts();
        } else {
          showToast(res.message || 'Failed to activate product', 'error');
        }
      }
    } catch {
      showToast('Action failed', 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl shadow-2xl font-bold text-sm flex items-center gap-2.5 transition-all ${
            toast.type === 'success'
              ? 'bg-[#0d1d25] text-emerald-400 border border-emerald-500/40'
              : 'bg-rose-950 text-rose-300 border border-rose-500/40'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Product Catalog Management</h1>
            <span className="bg-amber-100 text-amber-800 text-xs font-black px-2.5 py-0.5 rounded-full">
              Phase 3B
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Authoritative B2B wholesale product registry, tiered volume pricing, and digital asset management.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadProducts()}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-sm shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Product</span>
          </button>
        </div>
      </div>

      {/* Filters & Search Toolbar (IMG-07, IMG-08) */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* Search (IMG-07) */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by product name, SKU, or brand..."
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            />
          </div>

          {/* Status Filter (IMG-08) */}
          <div>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>

          {/* Low Stock Toggle (IMG-08) */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
            <input
              type="checkbox"
              id="lowStockCheck"
              checked={lowStockFilter}
              onChange={e => {
                setLowStockFilter(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-500"
            />
            <label htmlFor="lowStockCheck" className="text-xs font-bold text-slate-700 select-none cursor-pointer">
              Low Stock Alert Only
            </label>
          </div>
        </div>
      </div>

      {/* Product List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 text-sm font-semibold flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
            <span>Loading products...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Layers className="w-12 h-12 mx-auto text-slate-300 mb-2" />
            <p className="font-bold text-sm text-slate-600">No products found</p>
            <p className="text-xs mt-0.5">Try refining your search or filter parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600 border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold tracking-wider uppercase text-[10px]">
                  <th className="py-3 px-4">Image</th>
                  <th className="py-3 px-4">Product & SKU</th>
                  <th className="py-3 px-4">Taxonomy</th>
                  <th className="py-3 px-4">Pricing</th>
                  <th className="py-3 px-4">Stock</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {products.map(p => {
                  const primaryImg =
                    p.images?.find(i => i.isPrimary)?.url ||
                    (p.images && p.images.length > 0 ? p.images[0].url : null) ||
                    p.imageUrl ||
                    p.image ||
                    '/logo.jpg';
                  const isActive = p.isActive !== false;
                  const isLow = (p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 20);

                  return (
                    <tr key={p.productId} className="hover:bg-slate-50/60 transition-colors">
                      {/* Image Thumbnail (IMG-30) */}
                      <td className="py-3 px-4">
                        <div
                          onClick={() => {
                            setActiveImageProduct(p);
                            setShowImageModal(true);
                          }}
                          className="w-12 h-12 rounded-xl bg-slate-100 overflow-hidden border border-slate-200 flex items-center justify-center relative cursor-pointer group"
                        >
                          <img
                            src={primaryImg}
                            alt={p.productName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                          {p.images && p.images.length > 0 && (
                            <span className="absolute bottom-0 right-0 bg-slate-900/80 text-white text-[9px] font-black px-1 rounded-tl">
                              {p.images.length}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Name & SKU */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-sm">{p.productName}</div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                          <span>SKU: {p.sku}</span>
                          {p.barcode && <span>• Barcode: {p.barcode}</span>}
                        </div>
                      </td>

                      {/* Brand & Category */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-700">{p.brandName || 'General'}</div>
                        <div className="text-[11px] text-slate-400">{p.categoryName || 'Catalogue'}</div>
                      </td>

                      {/* Pricing */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-emerald-700">
                          ₹{p.wholesalePrice ?? p.sellingPrice ?? 0}
                        </div>
                        <div className="text-[11px] text-slate-400 line-through">
                          MRP: ₹{p.mrp}
                        </div>
                      </td>

                      {/* Stock */}
                      <td className="py-3 px-4">
                        <div className={`font-bold ${isLow ? 'text-rose-600' : 'text-slate-800'}`}>
                          {p.stockQuantity ?? 0} {p.unit || 'units'}
                        </div>
                        {isLow && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600">
                            <AlertTriangle className="w-3 h-3" /> Low Stock
                          </span>
                        )}
                      </td>

                      {/* Status (IMG-05, IMG-06) */}
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleActive(p)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer ${
                            isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                          <span>{isActive ? 'Active' : 'Inactive'}</span>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Manage Images (Phase 3B-2B) */}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveImageProduct(p);
                              setShowImageModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                            title="Manage Images"
                          >
                            <ImageIcon className="w-4 h-4" />
                          </button>

                          {/* Edit Product (IMG-04) */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingProduct(p);
                              setShowEditModal(true);
                            }}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar (IMG-09) */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/60 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing Page <span className="font-bold text-slate-900">{page}</span> of{' '}
            <span className="font-bold text-slate-900">{totalPages}</span> ({totalCount} total products)
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors flex items-center gap-1"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* CREATE PRODUCT MODAL (IMG-03) */}
      {/* ==================================================================== */}
      {showCreateModal && (
        <CreateProductModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            showToast('Product registered successfully!');
            loadProducts();
          }}
          onError={msg => showToast(msg, 'error')}
        />
      )}

      {/* ==================================================================== */}
      {/* EDIT PRODUCT MODAL (IMG-04) */}
      {/* ==================================================================== */}
      {showEditModal && editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => {
            setShowEditModal(false);
            setEditingProduct(null);
          }}
          onSuccess={() => {
            setShowEditModal(false);
            setEditingProduct(null);
            showToast('Product updated successfully!');
            loadProducts();
          }}
          onError={msg => showToast(msg, 'error')}
        />
      )}

      {/* ==================================================================== */}
      {/* IMAGE MANAGEMENT MODAL (Phase 3B-2B IMG-10 to IMG-26) */}
      {/* ==================================================================== */}
      {showImageModal && activeImageProduct && (
        <ImageManagementModal
          product={activeImageProduct}
          onClose={() => {
            setShowImageModal(false);
            setActiveImageProduct(null);
            loadProducts();
          }}
          onProductUpdated={updated => {
            setActiveImageProduct(updated);
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
};

// ============================================================================
// CREATE PRODUCT MODAL COMPONENT (IMG-03)
// ============================================================================
interface CreateProductModalProps {
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

const CreateProductModal: React.FC<CreateProductModalProps> = ({ onClose, onSuccess, onError }) => {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    sku: '',
    barcode: '',
    productName: '',
    brandId: 'brand_parle',
    brandName: 'Parle',
    categoryId: 'cat_biscuits',
    categoryName: 'Biscuits & Cookies',
    mrp: '',
    wholesalePrice: '',
    stockQuantity: '',
    unit: 'Pack',
    packSize: '100g',
    caseQuantity: '24',
    minimumOrderQuantity: '1',
    description: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        mrp: parseFloat(formData.mrp) || 0,
        wholesalePrice: parseFloat(formData.wholesalePrice) || 0,
        stockQuantity: parseInt(formData.stockQuantity, 10) || 0,
        caseQuantity: parseInt(formData.caseQuantity, 10) || 1,
        minimumOrderQuantity: parseInt(formData.minimumOrderQuantity, 10) || 1,
        isActive: true,
      };

      const res = await AdminClient.createProduct(payload);
      if (res.success) {
        onSuccess();
      } else {
        onError(res.message || 'Failed to create product.');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to create product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-slide-up my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">Add New FMCG Product</h2>
            <p className="text-xs text-slate-500">Super Admin authoritative registration (Phase 3B-2A)</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">SKU *</label>
              <input
                type="text"
                required
                value={formData.sku}
                onChange={e => setFormData({ ...formData, sku: e.target.value.toUpperCase() })}
                placeholder="e.g. PAR-GLU-100G"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Barcode (EAN-13)</label>
              <input
                type="text"
                value={formData.barcode}
                onChange={e => setFormData({ ...formData, barcode: e.target.value })}
                placeholder="e.g. 8901234567890"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={formData.productName}
              onChange={e => setFormData({ ...formData, productName: e.target.value })}
              placeholder="e.g. Parle-G Glucose Biscuits 100g"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Brand Name *</label>
              <input
                type="text"
                required
                value={formData.brandName}
                onChange={e => setFormData({ ...formData, brandName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={formData.categoryName}
                onChange={e => setFormData({ ...formData, categoryName: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.mrp}
                onChange={e => setFormData({ ...formData, mrp: e.target.value })}
                placeholder="10.00"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Wholesale Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.wholesalePrice}
                onChange={e => setFormData({ ...formData, wholesalePrice: e.target.value })}
                placeholder="8.50"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Initial Stock *</label>
              <input
                type="number"
                required
                value={formData.stockQuantity}
                onChange={e => setFormData({ ...formData, stockQuantity: e.target.value })}
                placeholder="100"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Unit</label>
              <input
                type="text"
                value={formData.unit}
                onChange={e => setFormData({ ...formData, unit: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pack Size</label>
              <input
                type="text"
                value={formData.packSize}
                onChange={e => setFormData({ ...formData, packSize: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Case Quantity</label>
              <input
                type="number"
                value={formData.caseQuantity}
                onChange={e => setFormData({ ...formData, caseQuantity: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// EDIT PRODUCT MODAL COMPONENT (IMG-04)
// ============================================================================
interface EditProductModalProps {
  product: Product;
  onClose: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}

const EditProductModal: React.FC<EditProductModalProps> = ({ product, onClose, onSuccess, onError }) => {
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    productName: product.productName || '',
    mrp: String(product.mrp || ''),
    wholesalePrice: String(product.wholesalePrice || product.sellingPrice || ''),
    stockQuantity: String(product.stockQuantity || 0),
    packSize: product.packSize || '',
    caseQuantity: String(product.caseQuantity || 1),
    minimumOrderQuantity: String(product.minimumOrderQuantity || 1),
    description: product.description || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        productName: formData.productName,
        mrp: parseFloat(formData.mrp),
        wholesalePrice: parseFloat(formData.wholesalePrice),
        stockQuantity: parseInt(formData.stockQuantity, 10),
        packSize: formData.packSize,
        caseQuantity: parseInt(formData.caseQuantity, 10),
        minimumOrderQuantity: parseInt(formData.minimumOrderQuantity, 10),
        description: formData.description,
      };

      const res = await AdminClient.updateProduct(product.productId, payload);
      if (res.success) {
        onSuccess();
      } else {
        onError(res.message || 'Failed to update product.');
      }
    } catch (err: any) {
      onError(err.message || 'Failed to update product');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 animate-slide-up my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900">Edit Product: {product.sku}</h2>
            <p className="text-xs text-slate-500">ID: {product.productId}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Product Name *</label>
            <input
              type="text"
              required
              value={formData.productName}
              onChange={e => setFormData({ ...formData, productName: e.target.value })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">MRP (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.mrp}
                onChange={e => setFormData({ ...formData, mrp: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Wholesale Price (₹) *</label>
              <input
                type="number"
                step="0.01"
                required
                value={formData.wholesalePrice}
                onChange={e => setFormData({ ...formData, wholesalePrice: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-emerald-700 focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Stock Quantity *</label>
              <input
                type="number"
                required
                value={formData.stockQuantity}
                onChange={e => setFormData({ ...formData, stockQuantity: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Pack Size</label>
              <input
                type="text"
                value={formData.packSize}
                onChange={e => setFormData({ ...formData, packSize: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Case Quantity</label>
              <input
                type="number"
                value={formData.caseQuantity}
                onChange={e => setFormData({ ...formData, caseQuantity: e.target.value })}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs rounded-xl shadow-xs transition-all disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================================================
// IMAGE MANAGEMENT MODAL COMPONENT (Phase 3B-2B IMG-10 to IMG-26)
// ============================================================================
interface ImageManagementModalProps {
  product: Product;
  onClose: () => void;
  onProductUpdated: (product: Product) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}

const ImageManagementModal: React.FC<ImageManagementModalProps> = ({
  product,
  onClose,
  onProductUpdated,
  showToast,
}) => {
  const [images, setImages] = useState<ProductImageMetadata[]>(
    Array.isArray(product.images) ? [...product.images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)) : []
  );
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);

  // Sync images state
  useEffect(() => {
    if (product.images) {
      setImages([...product.images].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    }
  }, [product.images]);

  // Handle File Selection for Upload (IMG-10 to IMG-18)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input
    e.target.value = '';

    // Max 5 images check (IMG-17, IMG-18)
    if (images.length >= 5) {
      showToast('Maximum 5 images allowed per product. Please delete an image first.', 'error');
      return;
    }

    // Client-side MIME validation (IMG-10, 11, 12, 13, 14)
    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();

    if (mime === 'image/svg+xml' || name.endsWith('.svg')) {
      showToast('SVG format is rejected for product catalog images.', 'error');
      return;
    }

    if (mime === 'image/gif' || name.endsWith('.gif')) {
      showToast('GIF format is rejected.', 'error');
      return;
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(mime)) {
      showToast('Only JPEG, PNG, and WebP formats are supported.', 'error');
      return;
    }

    // Size check <= 5MB (IMG-15)
    if (file.size > 5 * 1024 * 1024) {
      showToast('File size exceeds 5MB limit.', 'error');
      return;
    }

    // Read base64
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await AdminClient.uploadProductImage(product.productId, {
          fileData: base64,
          fileName: file.name,
          contentType: file.type,
          altText: product.productName,
        });

        if (res.success && res.images) {
          setImages(res.images);
          onProductUpdated({ ...product, images: res.images });
          showToast('Image uploaded successfully!');
        } else {
          showToast(res.message || 'Image upload failed.', 'error');
        }
      } catch (err: any) {
        showToast(err.message || 'Upload failed', 'error');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Set Primary (IMG-19, IMG-20)
  const handleSetPrimary = async (imageId: string) => {
    try {
      const res = await AdminClient.setPrimaryProductImage(product.productId, imageId);
      if (res.success && res.images) {
        setImages(res.images);
        onProductUpdated({ ...product, images: res.images });
        showToast('Primary image updated!');
      } else {
        showToast(res.message || 'Failed to set primary image', 'error');
      }
    } catch {
      showToast('Action failed', 'error');
    }
  };

  // Reorder Images (IMG-21)
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= images.length) return;

    const reordered = [...images];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const imageIds = reordered.map(img => img.imageId);

    try {
      const res = await AdminClient.reorderProductImages(product.productId, imageIds);
      if (res.success && res.images) {
        setImages(res.images);
        onProductUpdated({ ...product, images: res.images });
        showToast('Images reordered!');
      } else {
        showToast(res.message || 'Failed to reorder images', 'error');
      }
    } catch {
      showToast('Reorder failed', 'error');
    }
  };

  // Delete Image (IMG-22, IMG-23, IMG-24)
  const handleDelete = async (imageId: string) => {
    try {
      const res = await AdminClient.deleteProductImage(product.productId, imageId);
      if (res.success && res.images) {
        setImages(res.images);
        onProductUpdated({ ...product, images: res.images });
        showToast('Image deleted.');
      } else {
        showToast(res.message || 'Failed to delete image', 'error');
      }
    } catch {
      showToast('Delete failed', 'error');
    }
  };

  // Replace Image (IMG-25)
  const handleReplaceSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replaceTargetId) return;

    e.target.value = '';

    const mime = file.type.toLowerCase();
    const name = file.name.toLowerCase();

    if (mime === 'image/svg+xml' || name.endsWith('.svg')) {
      showToast('SVG format is rejected.', 'error');
      return;
    }

    if (mime === 'image/gif' || name.endsWith('.gif')) {
      showToast('GIF format is rejected.', 'error');
      return;
    }

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(mime)) {
      showToast('Only JPEG, PNG, and WebP are allowed.', 'error');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast('File exceeds 5MB limit.', 'error');
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      try {
        const res = await AdminClient.replaceProductImage(product.productId, replaceTargetId, {
          fileData: base64,
          fileName: file.name,
          contentType: file.type,
        });

        if (res.success && res.images) {
          setImages(res.images);
          onProductUpdated({ ...product, images: res.images });
          showToast('Image replaced successfully!');
        } else {
          showToast(res.message || 'Failed to replace image', 'error');
        }
      } catch {
        showToast('Replacement failed', 'error');
      } finally {
        setUploading(false);
        setReplaceTargetId(null);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 animate-slide-up my-8">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-amber-500" />
              <span>Manage Product Images: {product.productName}</span>
            </h2>
            <p className="text-xs text-slate-500">
              {images.length} / 5 Images • Exactly one Primary image enforced
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-900 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden File Inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleFileSelect}
          className="hidden"
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleReplaceSelect}
          className="hidden"
        />

        {/* Image Grid / Gallery */}
        <div className="mt-4 space-y-3">
          {images.length === 0 ? (
            <div className="p-8 border-2 border-dashed border-slate-200 rounded-2xl text-center">
              <UploadCloud className="w-10 h-10 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-sm text-slate-700">No images uploaded yet</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Upload up to 5 images (JPEG, PNG, or WebP up to 5MB). The first uploaded image will automatically become Primary.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {images.map((img, idx) => (
                <div
                  key={img.imageId}
                  className={`p-3 rounded-2xl border transition-all flex items-center gap-3 relative ${
                    img.isPrimary
                      ? 'bg-amber-50/50 border-amber-300 shadow-xs'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="w-20 h-20 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center relative">
                    <img src={img.url} alt={img.altText || ''} className="w-full h-full object-cover" />
                    {img.isPrimary && (
                      <span className="absolute top-1 left-1 bg-amber-500 text-slate-950 text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow-xs">
                        Primary
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-900">
                      <span>Image #{idx + 1}</span>
                      {img.isPrimary && <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      {img.imageId}
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {!img.isPrimary && (
                        <button
                          type="button"
                          onClick={() => handleSetPrimary(img.imageId)}
                          className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 text-[10px] font-bold rounded-md transition-colors"
                        >
                          Make Primary
                        </button>
                      )}

                      {/* Move Up / Down */}
                      <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-md">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, 'up')}
                          className="px-1.5 py-1 text-slate-600 hover:text-slate-900 disabled:opacity-30"
                          title="Move Up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={idx === images.length - 1}
                          onClick={() => handleMove(idx, 'down')}
                          className="px-1.5 py-1 text-slate-600 hover:text-slate-900 disabled:opacity-30"
                          title="Move Down"
                        >
                          ↓
                        </button>
                      </div>

                      {/* Replace */}
                      <button
                        type="button"
                        onClick={() => {
                          setReplaceTargetId(img.imageId);
                          replaceInputRef.current?.click();
                        }}
                        className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-md transition-colors"
                        title="Replace Image Content"
                      >
                        Replace
                      </button>

                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(img.imageId)}
                        className="p-1 text-rose-500 hover:bg-rose-50 rounded-md transition-colors"
                        title="Delete Image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload Button */}
          {images.length < 5 && (
            <div className="pt-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 border-2 border-dashed border-amber-400 bg-amber-50/40 hover:bg-amber-50 text-amber-900 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
                    <span>Uploading image...</span>
                  </>
                ) : (
                  <>
                    <UploadCloud className="w-4 h-4 text-amber-600" />
                    <span>Upload New Image ({5 - images.length} remaining)</span>
                  </>
                )}
              </button>
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded-xl text-[11px] text-slate-500 space-y-1">
            <div>• Supported formats: <strong>JPEG, PNG, WebP</strong>. SVG and GIF are strictly rejected.</div>
            <div>• Maximum image size: <strong>5MB</strong>. Maximum 5 images per product.</div>
            <div>• Deleting the primary image automatically promotes the next available image to primary.</div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-4 border-t border-slate-100 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white hover:bg-slate-800 text-xs font-bold rounded-xl shadow-xs"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
