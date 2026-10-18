// Design §5.2. These are presentation destinations, never permissions or API routes.
export const navigationGroups = [
  {
    label: 'Overview',
    links: [
      ['Dashboard', '/app'],
      ['Reports', '/app/reports'],
    ],
  },
  {
    label: 'Catalog and shopping',
    links: [
      ['Products', '/app/products'],
      ['Categories', '/app/categories'],
      ['Inventory', '/app/inventory'],
      ['Coupons', '/app/coupons'],
      ['Reviews', '/app/reviews'],
    ],
  },
  {
    label: 'Orders and payments',
    links: [
      ['Orders', '/app/orders'],
      ['Payments', '/app/payments'],
    ],
  },
  {
    label: 'Customers and after-sales',
    links: [
      ['Customers', '/app/customers'],
      ['Returns', '/app/returns'],
      ['Refunds', '/app/refunds'],
    ],
  },
  {
    label: 'Configuration',
    links: [
      ['Delivery settings', '/app/settings/delivery'],
      ['Store settings', '/app/settings'],
    ],
  },
] as const

export function navigationContext(pathname: string) {
  return navigationGroups
    .flatMap((group) => [...group.links])
    .filter(
      ([, href]) =>
        pathname === href || (href !== '/app' && pathname.startsWith(`${href}/`)),
    )
    .sort((a, b) => b[1].length - a[1].length)[0]
}
