import type { Cashier, CashierPermissions } from '../types/pos';

export const ADMIN_PERMISSIONS: CashierPermissions = {
  allowCreditSales: true,
  viewInventory: true,
  editInventory: true,
  viewReports: true,
  editOrDeleteSales: true,
  manageCosting: true,
  deleteShifts: true,
};

/**
 * Restrictive defaults for newly created Cashier profiles.
 * Administrators must explicitly grant each capability.
 */
export const DEFAULT_CASHIER_PERMISSIONS: CashierPermissions = {
  allowCreditSales: false,
  viewInventory: false,
  editInventory: false,
  viewReports: false,
  editOrDeleteSales: false,
  manageCosting: false,
  deleteShifts: false,
};

export interface PermissionDefinition {
  key: keyof CashierPermissions;
  label: string;
  description: string;
}

export const CASHIER_PERMISSION_ITEMS: PermissionDefinition[] = [
  {
    key: 'allowCreditSales',
    label: 'Dar ventas a Crédito',
    description: 'Permite usar la opción Crédito en Finalizar cobro. Si está apagado, solo cobra de Contado.',
  },
  {
    key: 'viewInventory',
    label: 'Ver Inventario / Stock',
    description: 'Muestra la pestaña Stock para consultar las existencias de su sucursal asignada.',
  },
  {
    key: 'editInventory',
    label: 'Editar Inventario / Stock',
    description: 'Permite crear o editar productos, ajustar precios, cargar stock y eliminar artículos.',
  },
  {
    key: 'viewReports',
    label: 'Ver Reportes y Cuentas por cobrar',
    description: 'Habilita la pestaña Reportes con métricas, ventas y créditos de su sucursal.',
  },
  {
    key: 'editOrDeleteSales',
    label: 'Editar o Eliminar Ventas',
    description: 'Habilita los botones Editar y Eliminar en Reportes → Ventas del período.',
  },
  {
    key: 'manageCosting',
    label: 'Ver o gestionar Costos / Gastos',
    description: 'Muestra la pestaña Costos para calculadora al mayor, proveedores y gastos.',
  },
  {
    key: 'deleteShifts',
    label: 'Eliminar Turnos / Cierres',
    description: 'Permite eliminar registros del historial de turnos y cierres de caja.',
  },
];

export function isAdminUser(user: Cashier | null | undefined): boolean {
  return user?.role === 'admin';
}

export function normalizeCashierPermissions(
  raw?: Partial<CashierPermissions>,
  role: 'admin' | 'cashier' = 'cashier'
): CashierPermissions {
  if (role === 'admin') {
    return { ...ADMIN_PERMISSIONS };
  }

  const editInventory = Boolean(raw?.editInventory);
  const viewInventory = Boolean(raw?.viewInventory) || editInventory;
  const editOrDeleteSales = Boolean(raw?.editOrDeleteSales);
  const viewReports = Boolean(raw?.viewReports) || editOrDeleteSales;

  return {
    allowCreditSales: Boolean(raw?.allowCreditSales),
    viewInventory,
    editInventory,
    viewReports,
    editOrDeleteSales,
    manageCosting: Boolean(raw?.manageCosting),
    deleteShifts: Boolean(raw?.deleteShifts),
  };
}

export function getEffectivePermissions(user: Cashier | null | undefined): CashierPermissions {
  if (!user) {
    return { ...DEFAULT_CASHIER_PERMISSIONS };
  }
  return normalizeCashierPermissions(user.permissions, user.role);
}

/**
 * Helper for toggling a single permission while keeping dependent permissions consistent
 * (e.g., enabling editInventory auto-enables viewInventory; disabling viewInventory disables editInventory).
 */
export function toggleCashierPermission(
  current: CashierPermissions,
  key: keyof CashierPermissions,
  nextValue: boolean
): CashierPermissions {
  const next: CashierPermissions = {
    ...current,
    [key]: nextValue,
  };

  if (key === 'editInventory' && nextValue) {
    next.viewInventory = true;
  } else if (key === 'viewInventory' && !nextValue) {
    next.editInventory = false;
  }

  if (key === 'editOrDeleteSales' && nextValue) {
    next.viewReports = true;
  } else if (key === 'viewReports' && !nextValue) {
    next.editOrDeleteSales = false;
  }

  return next;
}

export function countActivePermissions(permissions?: Partial<CashierPermissions>): number {
  const normalized = normalizeCashierPermissions(permissions, 'cashier');
  return CASHIER_PERMISSION_ITEMS.reduce(
    (count, item) => count + (normalized[item.key] ? 1 : 0),
    0
  );
}
