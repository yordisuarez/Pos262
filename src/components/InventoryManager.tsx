import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  PackagePlus,
  Search,
  Warehouse,
} from 'lucide-react';
import type { Branch, Cashier, Product, StockTransfer } from '../types/pos';

interface InventoryManagerProps {
  branches: Branch[];
  activeBranchId: string;
  products: Product[];
  transfers: StockTransfer[];
  activeCashier: Cashier;
  onLoadStock: (params: {
    branchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
  onTransferStock: (params: {
    fromBranchId: string;
    toBranchId: string;
    productId: string;
    quantity: number;
    notes?: string;
  }) => Promise<void>;
}

export const InventoryManager: React.FC<InventoryManagerProps> = ({
  branches,
  activeBranchId,
  products,
  transfers,
  activeCashier,
  onLoadStock,
  onTransferStock,
}) => {
  const [loadBranchId, setLoadBranchId] = useState<string>(activeBranchId);
  const [loadProductId, setLoadProductId] = useState<string>(products[0]?.id || '');
  const [loadQtyInput, setLoadQtyInput] = useState<string>('10');
  const [loadNotes, setLoadNotes] = useState<string>('');
  const [loadFeedback, setLoadFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  const [fromBranchId, setFromBranchId] = useState<string>(activeBranchId);
  const [toBranchId, setToBranchId] = useState<string>(
    branches.find((b) => b.id !== activeBranchId)?.id || branches[0]?.id || ''
  );
  const [transferProductId, setTransferProductId] = useState<string>(products[0]?.id || '');
  const [transferQtyInput, setTransferQtyInput] = useState<string>('5');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [transferFeedback, setTransferFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const [inventorySearch, setInventorySearch] = useState<string>('');

  const selectedTransferProduct = useMemo(
    () => products.find((p) => p.id === transferProductId) || products[0],
    [products, transferProductId]
  );

  const availableInSource = selectedTransferProduct
    ? selectedTransferProduct.stockByBranch[fromBranchId] ?? 0
    : 0;

  const filteredProducts = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [products, inventorySearch]);

  const handleLoadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadFeedback(null);

    const qty = parseInt(loadQtyInput, 10);
    if (!loadProductId || !loadBranchId || !Number.isFinite(qty) || qty <= 0) {
      setLoadFeedback({ type: 'err', text: 'Ingresa una cantidad entera mayor a 0.' });
      return;
    }

    await onLoadStock({
      branchId: loadBranchId,
      productId: loadProductId,
      quantity: qty,
      notes: loadNotes.trim() || undefined,
    });

    const branchName = branches.find((b) => b.id === loadBranchId)?.name ?? '';
    const productName = products.find((p) => p.id === loadProductId)?.name ?? '';
    setLoadNotes('');
    setLoadFeedback({
      type: 'ok',
      text: `Se cargaron +${qty} und de "${productName}" en ${branchName}.`,
    });
  };

  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTransferFeedback(null);

    const qty = parseInt(transferQtyInput, 10);
    if (fromBranchId === toBranchId) {
      setTransferFeedback({
        type: 'err',
        text: 'La sucursal de origen y la sucursal de destino deben ser diferentes.',
      });
      return;
    }
    if (!transferProductId || !Number.isFinite(qty) || qty <= 0) {
      setTransferFeedback({ type: 'err', text: 'Ingresa una cantidad entera mayor a 0.' });
      return;
    }
    if (qty > availableInSource) {
      setTransferFeedback({
        type: 'err',
        text: `Stock insuficiente en la sucursal de origen (disponible: ${availableInSource} und).`,
      });
      return;
    }

    await onTransferStock({
      fromBranchId,
      toBranchId,
      productId: transferProductId,
      quantity: qty,
      notes: transferNotes.trim() || undefined,
    });

    const fromName = branches.find((b) => b.id === fromBranchId)?.name ?? '';
    const toName = branches.find((b) => b.id === toBranchId)?.name ?? '';
    const productName = selectedTransferProduct?.name ?? '';
    setTransferNotes('');
    setTransferFeedback({
      type: 'ok',
      text: `Traslado registrado: ${qty} und de "${productName}" (${fromName} → ${toName}).`,
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 lg:p-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <PackagePlus className="h-4 w-4 text-[#76B900]" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Cargar stock a sucursal</h2>
              <p className="text-xs text-slate-500">
                Ingreso de mercancía por tienda · {activeCashier.name}
              </p>
            </div>
          </div>

          <form onSubmit={handleLoadSubmit} className="mt-3.5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700">Sucursal destino</label>
              <select
                value={loadBranchId}
                onChange={(e) => setLoadBranchId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              >
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name} ({branch.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700">Producto</label>
              <select
                value={loadProductId}
                onChange={(e) => setLoadProductId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} (Actual:{' '}
                    {product.stockByBranch[loadBranchId] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">
                  Cantidad *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={loadQtyInput}
                  onChange={(e) => setLoadQtyInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Referencia / Proveedor (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Factura proveedor #8841"
                  value={loadNotes}
                  onChange={(e) => setLoadNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {loadFeedback && (
              <p
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  loadFeedback.type === 'ok'
                    ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {loadFeedback.type === 'ok' && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />}
                {loadFeedback.text}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#84CC16] px-3 py-2 text-xs font-bold text-slate-950 hover:bg-[#76B900] transition-colors cursor-pointer"
            >
              <PackagePlus className="h-3.5 w-3.5" />
              Cargar stock
            </button>
          </form>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
            <ArrowLeftRight className="h-4 w-4 text-slate-800" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Traslado entre sucursales</h2>
              <p className="text-xs text-slate-500">
                Descuenta del origen, suma en el destino y guarda historial offline-first
              </p>
            </div>
          </div>

          <form onSubmit={handleTransferSubmit} className="mt-3.5 space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Sucursal origen</label>
                <select
                  value={fromBranchId}
                  onChange={(e) => {
                    setFromBranchId(e.target.value);
                    setTransferFeedback(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700">Sucursal destino</label>
                <select
                  value={toBranchId}
                  onChange={(e) => {
                    setToBranchId(e.target.value);
                    setTransferFeedback(null);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold text-slate-700">Producto</label>
                <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-600">
                  Disponible: {availableInSource} und
                </span>
              </div>
              <select
                value={transferProductId}
                onChange={(e) => {
                  setTransferProductId(e.target.value);
                  setTransferFeedback(null);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.sku} — {product.name} (Origen:{' '}
                    {product.stockByBranch[fromBranchId] ?? 0} → Destino:{' '}
                    {product.stockByBranch[toBranchId] ?? 0})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Cantidad *</label>
                <input
                  type="number"
                  min="1"
                  max={Math.max(1, availableInSource)}
                  step="1"
                  required
                  value={transferQtyInput}
                  onChange={(e) => setTransferQtyInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-mono text-xs font-bold tabular-nums text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700">
                  Motivo / Guía (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Reposición de anaquel Sucursal Norte"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#76B900] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {transferFeedback && (
              <p
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  transferFeedback.type === 'ok'
                    ? 'border-[#84CC16]/40 bg-[#F7FEE7] text-[#3F6212]'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {transferFeedback.type === 'ok' && (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#76B900]" />
                )}
                {transferFeedback.text}
              </p>
            )}

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Registrar traslado
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Warehouse className="h-4 w-4 text-slate-700" />
            <div>
              <h2 className="text-sm font-bold text-slate-900">Existencias por sucursal</h2>
              <p className="text-xs text-slate-500">
                Stock actualizado en tiempo real para todas las tiendas
              </p>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Filtrar producto o SKU..."
              value={inventorySearch}
              onChange={(e) => setInventorySearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-xs text-slate-900 focus:border-[#76B900] focus:bg-white focus:outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-4 font-semibold">Producto</th>
                {branches.map((branch) => (
                  <th key={branch.id} className="py-2 px-3 font-semibold text-right whitespace-nowrap">
                    {branch.name}
                  </th>
                ))}
                <th className="py-2 pl-3 font-semibold text-right">Total red</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((product) => {
                const totalNetwork = branches.reduce(
                  (sum, b) => sum + (product.stockByBranch[b.id] ?? 0),
                  0
                );
                return (
                  <tr key={product.id} className="hover:bg-slate-50/70">
                    <td className="py-2 pr-4">
                      <p className="font-semibold text-slate-900">{product.name}</p>
                      <p className="text-[11px] text-slate-500">
                        <span className="font-mono">{product.sku}</span> · {product.category}
                      </p>
                    </td>
                    {branches.map((branch) => {
                      const qty = product.stockByBranch[branch.id] ?? 0;
                      const isZero = qty <= 0;
                      const isLow = qty > 0 && qty <= product.minStock;
                      return (
                        <td
                          key={branch.id}
                          className={`py-2 px-3 text-right font-mono font-semibold tabular-nums ${
                            isZero
                              ? 'text-red-600'
                              : isLow
                              ? 'text-amber-700'
                              : 'text-slate-800'
                          }`}
                        >
                          {qty}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-3 text-right font-mono font-bold tabular-nums text-slate-900">
                      {totalNetwork}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 space-y-3.5">
        <div className="border-b border-slate-200 pb-3">
          <h2 className="text-sm font-bold text-slate-900">
            Historial de cargas y traslados ({transfers.length})
          </h2>
          <p className="text-xs text-slate-500">
            Registro auditable almacenado en IndexedDB con estado de sincronización
          </p>
        </div>

        {transfers.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">
            Aún no se han registrado cargas de inventario ni traslados entre sucursales.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {transfers.map((movement) => (
              <div
                key={movement.id}
                className="flex flex-col gap-1.5 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900">
                    {movement.type === 'load' ? 'Carga de stock' : 'Traslado'}:{' '}
                    <span className="font-mono text-[#558B00] tabular-nums">+{movement.quantity} und</span> ·{' '}
                    {movement.productName}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    {movement.type === 'transfer' ? (
                      <>
                        <span className="font-medium text-slate-700">
                          {movement.fromBranchName}
                        </span>
                        <ArrowRight className="h-3 w-3 text-slate-400" />
                        <span className="font-medium text-slate-700">{movement.toBranchName}</span>
                      </>
                    ) : (
                      <span className="font-medium text-slate-700">
                        Destino: {movement.toBranchName}
                      </span>
                    )}
                    <span aria-hidden="true">·</span>
                    <span>{movement.cashierName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">
                      {new Date(movement.createdAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </p>
                  {movement.notes && (
                    <p className="mt-0.5 text-[11px] text-slate-600">Nota: {movement.notes}</p>
                  )}
                </div>

                <span
                  className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                    movement.syncStatus === 'synced' ? 'text-[#558B00]' : 'text-amber-700'
                  }`}
                >
                  {movement.syncStatus === 'synced' ? 'Sincronizado' : 'Pendiente offline'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
