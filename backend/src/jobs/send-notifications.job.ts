import { createNotificationDeliveryService } from '../modules/notifications/notification-delivery.service.js'

// Keep the scheduled-job entry point stable; delivery policy and state belong to the domain.
export function createNotificationWorker(
  ...dependencies: Parameters<typeof createNotificationDeliveryService>
) {
  return createNotificationDeliveryService(...dependencies)
}
