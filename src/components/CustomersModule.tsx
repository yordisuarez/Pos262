import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Save,
  Search,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import type { Customer, Sale } from '../types/pos';
import { updateCustomer } from '../db/posDb';

const round2 = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

const formatUsd = (amount: number): string =>
  `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatVes = (amount: number): string =>
  `Bs ${amount.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

interface CustomersModuleProps {
  customers: Customer[];
  sales: Sale[];
  exchangeRate: number;
  onRefreshData?: () => Promise<void>;
  onAddCustomer?: (customer: Customer) => Promise<void>;
  onDeleteCustomer?: (customerId: string) => Promise<void>;
}

export const CustomersModule: React.FC<CustomersModuleProps> = ({
  customers,
  sales,
  exchangeRate,
  onRefreshData,
  onAddCustomer,
  onDeleteCustomer,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(customers[0]?.id || '');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'debt' | 'paid'>('all');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Edit customer modal state
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editDocumentId, setEditDocumentId] = useState<string>('');
  const [editPhone, setEditPhone] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  // New customer modal state
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDocumentId, setNewDocumentId] = useState<string>('');
  const [newPhone, setNewPhone] = useState<string>('');
  const [newNotes, setNewNotes] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const safeRate = Number.isFinite(exchangeRate) && exchangeRate > 0 ? exchangeRate : 1;

  // Filtered customers list
  const filteredCustomers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return customers;
    return customers.filter((c) => {
      const nameMatch = c.name.toLowerCase().includes(term);
      const docMatch = (c.documentId || '').toLowerCase().includes(term);
      const phoneMatch = (c.phone || '').toLowerCase().includes(term);
      return nameMatch || docMatch || phoneMatch;
    });
  }, [customers, searchTerm]);

  const selectedCustomer = useMemo(() => {
    if (!customers.length) return null;
    return customers.find((c) => c.id === selectedCustomerId) || filteredCustomers[0] || customers[0];
  }, [customers, filteredCustomers, selectedCustomerId]);

  // Customer sales and metrics
  const customerSales = useMemo(() => {
    if (!selectedCustomer) return [];
    return sales
      .filter((s) => s.customerId === selectedCustomer.id)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [sales, selectedCustomer]);

  const customerMetrics = useMemo(() => {
    let totalPurchasedUsd = 0;
    let totalPendingUsd = 0;
    const purchaseCount = customerSales.length;

    for (const sale of customerSales) {
      totalPurchasedUsd += Math.max(0, Number(sale.totalUsd) || 0);
      const pending = Math.max(0, Number(sale.pendingUsd) || 0);
      if (pending > 0 || sale.saleType === 'credit') {
        totalPendingUsd += pending > 0 ? pending : Math.max(0, (Number(sale.totalUsd) || 0) - (Number(sale.paidUsd) || 0));
      }
    }

    return {
      totalPurchasedUsd: round2(totalPurchasedUsd),
      totalPurchasedVes: round2(totalPurchasedUsd * safeRate),
      totalPendingUsd: round2(totalPendingUsd),
      totalPendingVes: round2(totalPendingUsd * safeRate),
      purchaseCount,
    };
  }, [customerSales, safeRate]);

  // Filtered purchase history
  const filteredSalesHistory = useMemo(() => {
    return customerSales.filter((sale) => {
      const pending = Math.max(0, Number(sale.pendingUsd) || 0);
      const isCreditOrPartial = sale.saleType === 'credit' || pending > 0;
      if (historyFilter === 'debt') return isCreditOrPartial && pending > 0;
      if (historyFilter === 'paid') return !isCreditOrPartial || pending <= 0;
      return true;
    });
  }, [customerSales, historyFilter]);

  const handleOpenEdit = (c: Customer) => {
    setEditName(c.name);
    setEditDocumentId(c.documentId || '');
    setEditPhone(c.phone || '');
    setEditNotes(c.notes || '');
    setErrorMsg('');
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    const trimmedName = editName.trim().slice(0, 120);
    if (!trimmedName) {
      setErrorMsg('El nombre del cliente es obligatorio.');
      return;
    }
    setIsSaving(true);
    setErrorMsg('');
    try {
      await updateCustomer(selectedCustomer.id, {
        name: trimmedName,
        documentId: editDocumentId.trim().slice(0, 40),
        phone: editPhone.trim().slice(0, 30),
        notes: editNotes.trim().slice(0, 500),
      });
      if (onRefreshData) await onRefreshData();
      setIsEditing(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error al actualizar el cliente.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRequestDelete = (c: Customer) => {
    setErrorMsg('');
    if (customerMetrics.totalPendingUsd > 0 || c.balanceUsd > 0) {
      setErrorMsg('No se puede eliminar este cliente porque tiene deuda pendiente. Debe saldar su cuenta primero.');
      return;
    }
    setConfirmDeleteId(c.id);
  };

  const handleConfirmDelete = async (c: Customer) => {
    setErrorMsg('');
    if (customerMetrics.totalPendingUsd > 0 || c.balanceUsd > 0) {
      setConfirmDeleteId(null);
      setErrorMsg('No se puede eliminar este cliente porque tiene deuda pendiente. Debe saldar su cuenta primero.');
      return;
    }
    setConfirmDeleteId(null);
    if (onDeleteCustomer) {
      await onDeleteCustomer(c.id);
    }
  };

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newName.trim().slice(0, 120);
    if (!trimmedName) {
      setErrorMsg('El nombre del cliente es obligatorio.');
      return;
    }
    const newCust: Customer = {
      id: `cust-${Date.now()}`,
      name: trimmedName,
      documentId: newDocumentId.trim().slice(0, 40) || 'V-00000000',
      phone: newPhone.trim().slice(0, 30),
      notes: newNotes.trim().slice(0, 500),
      creditLimitUsd: 500,
      balanceUsd: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    if (onAddCustomer) {
      await onAddCustomer(newCust);
    }
    setNewName('');
    setNewDocumentId('');
    setNewPhone('');
    setNewNotes('');
    setIsCreating(false);
    setSelectedCustomerId(newCust.id);
  };

  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-900 lg:flex-row overflow-hidden">
      {/* Left panel: Customer list */}
      <div className="w-full lg:w-96 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#76B900]" />
            <h2 className="text-base font-bold tracking-tight text-slate-900">Clientes Pos262</h2>
          </div>
          <button
            type="button"
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-[#76B900] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#65a30d] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-slate-200 bg-slate-50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, cédula o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs text-slate-950 placeholder-slate-400 focus:border-[#76B900] focus:outline-none"
            />
          </div>
        </div>

        {/* Customer list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {filteredCustomers.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No se encontraron clientes registrados.
            </div>
          ) : (
            filteredCustomers.map((c) => {
              const isSelected = selectedCustomer?.id === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedCustomerId(c.id);
                    setConfirmDeleteId(null);
                    setErrorMsg('');
                  }}
                  className={`w-full text-left rounded-lg p-3 transition-all cursor-pointer border ${
                    isSelected
                      ? 'border-[#76B900] bg-[#F7FEE7] text-slate-900 shadow-xs'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 truncate">{c.name}</span>
                    <span className="text-[11px] text-slate-500 font-mono">{c.documentId || 'S/C'}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{c.phone || 'Sin teléfono'}</span>
                    <span className={c.balanceUsd > 0 ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                      Deuda: {formatUsd(c.balanceUsd || 0)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right panel: Customer Profile, summary cards, purchase history */}
      <div className="flex-1 flex flex-col overflow-y-auto bg-slate-50 p-4 lg:p-6 space-y-6">
        {errorMsg && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorMsg('')}
              className="text-amber-600 hover:text-amber-900 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {!selectedCustomer ? (
          <div className="flex flex-1 items-center justify-center text-slate-500">
            <div className="text-center space-y-2">
              <User className="mx-auto h-12 w-12 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">Selecciona un cliente para ver su detalle</p>
            </div>
          </div>
        ) : (
          <>
            {/* Customer Header Card */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-extrabold text-slate-900">{selectedCustomer.name}</h1>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-mono text-slate-700 border border-slate-200">
                      {selectedCustomer.documentId || 'Cédula / RIF no especificada'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Teléfono: <span className="text-slate-800 font-medium">{selectedCustomer.phone || 'No registrado'}</span> · Creado:{' '}
                    {new Date(selectedCustomer.createdAt).toLocaleDateString()}
                  </p>
                  {selectedCustomer.notes && (
                    <p className="text-xs text-slate-500 mt-1 italic">
                      Notas: <span className="text-slate-700">{selectedCustomer.notes}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(selectedCustomer)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:border-[#76B900] hover:bg-slate-50 cursor-pointer shadow-xs"
                  >
                    <Pencil className="h-3.5 w-3.5 text-[#76B900]" />
                    Editar cliente
                  </button>
                  {confirmDeleteId === selectedCustomer.id ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleConfirmDelete(selectedCustomer)}
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-red-700 cursor-pointer shadow-xs"
                      >
                        Confirmar eliminar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRequestDelete(selectedCustomer)}
                      className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 cursor-pointer shadow-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      Eliminar
                    </button>
                  )}
                </div>
              </div>

              {/* 3 Summary Cards */}
              <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* 1. Deuda total pendiente */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Deuda pendiente</span>
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="mt-2">
                    <p className="text-lg font-black text-slate-900">{formatUsd(customerMetrics.totalPendingUsd)}</p>
                    <p className="text-[11px] text-slate-500">{formatVes(customerMetrics.totalPendingVes)}</p>
                  </div>
                </div>

                {/* 2. Total comprado */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Total comprado</span>
                    <DollarSign className="h-4 w-4 text-[#76B900]" />
                  </div>
                  <div className="mt-2">
                    <p className="text-lg font-black text-slate-900">{formatUsd(customerMetrics.totalPurchasedUsd)}</p>
                    <p className="text-[11px] text-slate-500">{formatVes(customerMetrics.totalPurchasedVes)}</p>
                  </div>
                </div>

                {/* 3. Cantidad de compras */}
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                    <span>Cantidad de compras</span>
                    <Receipt className="h-4 w-4 text-sky-600" />
                  </div>
                  <div className="mt-2">
                    <p className="text-lg font-black text-slate-900">{customerMetrics.purchaseCount}</p>
                    <p className="text-[11px] text-slate-500">Transacciones registradas</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Purchase History Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-[#76B900]" />
                  <h3 className="text-sm font-bold text-slate-900">Historial de Compras</h3>
                </div>

                {/* Quick Filters */}
                <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('all')}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      historyFilter === 'all' ? 'bg-[#76B900] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas ({customerSales.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('debt')}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      historyFilter === 'debt' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Con deuda
                  </button>
                  <button
                    type="button"
                    onClick={() => setHistoryFilter('paid')}
                    className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors cursor-pointer ${
                      historyFilter === 'paid' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Pagadas
                  </button>
                </div>
              </div>

              {filteredSalesHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No hay compras registradas para este filtro.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSalesHistory.map((sale) => {
                    const isExpanded = expandedSaleId === sale.id;
                    const pending = Math.max(0, Number(sale.pendingUsd) || 0);
                    const isDebt = sale.saleType === 'credit' || pending > 0;

                    return (
                      <div
                        key={sale.id}
                        className="rounded-lg border border-slate-200 bg-white transition-all hover:border-slate-300 shadow-2xs"
                      >
                        <div className="p-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 font-mono">{sale.receiptNumber}</span>
                              <span
                                className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                                  isDebt ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                }`}
                              >
                                {isDebt ? 'Crédito / Pendiente' : 'Pagada'}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-slate-500">
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {new Date(sale.createdAt).toLocaleString()}
                              </span>
                              <span>·</span>
                              <span>Sucursal: {sale.branchName || 'Principal'}</span>
                              <span>·</span>
                              <span>Método: {sale.payments?.[0]?.method || 'Efectivo'}</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-4">
                            <div className="text-right">
                              <p className="text-xs font-extrabold text-slate-900">{formatUsd(sale.totalUsd)}</p>
                              {pending > 0 ? (
                                <p className="text-[11px] font-semibold text-amber-600">
                                  Saldo: {formatUsd(pending)} ({formatVes(pending * safeRate)})
                                </p>
                              ) : (
                                <p className="text-[11px] text-emerald-600 font-medium">Pagado 100%</p>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                              className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                            >
                              <span>{isExpanded ? 'Ocultar' : 'Productos'}</span>
                              {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>

                        {/* Accordion items details */}
                        {isExpanded && (
                          <div className="border-t border-slate-200 bg-slate-50 p-3.5 space-y-2">
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                              Productos en la compra ({sale.items?.length || 0})
                            </p>
                            <div className="space-y-1.5">
                              {sale.items?.map((item, idx) => (
                                <div
                                  key={`${item.productId}-${idx}`}
                                  className="flex items-center justify-between rounded bg-white px-3 py-2 text-xs border border-slate-200 shadow-2xs"
                                >
                                  <div>
                                    <p className="font-semibold text-slate-900">{item.name}</p>
                                    <p className="text-[11px] text-slate-500 font-mono">
                                      SKU: {item.sku} · Cantidad: {item.quantity} {item.unit || 'und'}
                                    </p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-bold text-slate-900">{formatUsd(item.priceUsd * item.quantity)}</p>
                                    <p className="text-[10px] text-slate-500">({formatUsd(item.priceUsd)} c/u)</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {sale.notes && (
                              <p className="text-xs text-slate-500 pt-2 italic">
                                Nota de venta: <span className="text-slate-800">{sale.notes}</span>
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Edit Customer Modal */}
      {isEditing && selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Pencil className="h-4 w-4 text-[#76B900]" />
                Editar Cliente: {selectedCustomer.name}
              </h3>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula / RIF</label>
                <input
                  type="text"
                  value={editDocumentId}
                  onChange={(e) => setEditDocumentId(e.target.value)}
                  placeholder="V-12345678 o J-12345678-9"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="0412-1234567"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas / Observaciones</label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Notas internas del cliente..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 rounded-lg bg-[#76B900] px-4 py-2 text-xs font-bold text-white hover:bg-[#65a30d] disabled:opacity-50 cursor-pointer"
                >
                  <Save className="h-4 w-4" />
                  {isSaving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Customer Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#76B900]" />
                Registrar Nuevo Cliente
              </h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre / Razón Social *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre completo o empresa"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Cédula / RIF</label>
                <input
                  type="text"
                  value={newDocumentId}
                  onChange={(e) => setNewDocumentId(e.target.value)}
                  placeholder="V-12345678 o J-12345678-9"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="0412-1234567"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Notas / Observaciones</label>
                <textarea
                  rows={2}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Notas internas..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#76B900] focus:outline-none resize-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-lg bg-[#76B900] px-4 py-2 text-xs font-bold text-white hover:bg-[#65a30d] cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  Registrar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
