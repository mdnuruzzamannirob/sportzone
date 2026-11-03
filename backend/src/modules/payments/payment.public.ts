import type { ClientSession } from 'mongoose'

// Gateway reports describe provider observations; domain services decide financial effects.
type GatewayFailure =
  | { readonly kind: 'rejected'; readonly code: 'INVALID_PROVIDER_INPUT' }
  | { readonly kind: 'uncertain'; readonly code: 'PROVIDER_UNCERTAIN' }

type GatewayReceipt = {
  status: 'VALID' | 'VALIDATED' | 'PENDING' | 'FAILED' | 'CANCELLED' | 'UNATTEMPTED' | 'EXPIRED'
  tranId: string
  validationId?: string
  bankTranId?: string
  amountPoisha?: number
  currency?: string
  requestedAmountPoisha?: number
  requestedCurrency?: string
  providerCollectedAt?: string
  riskLevel?: number
  riskTitle?: string
}

type GatewayEvidence = { merchantAccountKey: string; evidenceDigest: string }
type GatewayValidation =
  | GatewayFailure
  | (GatewayEvidence & { kind: 'record'; record: GatewayReceipt })

interface PaymentGateway {
  initiate(
    raw: unknown,
  ): Promise<
    | GatewayFailure
    | { readonly kind: 'rejected'; readonly code: 'PROVIDER_REJECTED' }
    | { kind: 'accepted'; sessionKey: string; redirectUrl: string; merchantAccountKey: string }
  >
  validate(raw: unknown): Promise<GatewayValidation>
  queryTransaction(
    raw: unknown,
  ): Promise<GatewayFailure | (GatewayEvidence & { kind: 'records'; records: GatewayReceipt[] })>
  querySession(raw: unknown): Promise<GatewayValidation>
  initiateRefund(
    raw: unknown,
  ): Promise<GatewayFailure | { kind: 'accepted'; refundRefId: string; evidenceDigest: string }>
  queryRefund(raw: unknown): Promise<
    | GatewayFailure
    | (GatewayEvidence & {
        kind: 'refund_report'
        status: 'refunded' | 'processing' | 'cancelled'
        refundRefId: string
        bankTranId: string
        providerRefundedAt?: string
      })
  >
}

interface PaymentReconciliation {
  jobKey: string
  due(cursor?: string): Promise<string[]>
  reconcile(
    attemptId: string,
    fence: (session: ClientSession) => Promise<void>,
  ): Promise<{
    skipped: boolean
    resolved: boolean
    escalated: boolean
  }>
}

type PaymentFundingSummary = {
  status: 'pending' | 'paid' | 'failed' | 'cancelled' | 'partially_refunded' | 'refunded'
  fundingContext: 'correction_only' | 'normal'
  expectedPoisha: number
  verifiedCollectedPoisha: number
  merchandiseFundedPoisha: number
  correctionCollectedPoisha: number
  unassignedCollectedPoisha: number
  riskStatus: 'clear' | 'review' | 'rejected'
  merchandiseRefundHeldPoisha: number
  merchandiseRefundCompletedPoisha: number
  correctionRefundHeldPoisha: number
  correctionRefundCompletedPoisha: number
}

type CustomerPaymentSummaryAccess = ((
  session: ClientSession,
  orderId: string,
) => Promise<PaymentFundingSummary>) & {
  many: (session: ClientSession, ids: string[]) => Promise<Map<string, PaymentFundingSummary>>
  fundedAt: (session: ClientSession, orderId: string) => Promise<string | undefined>
  history(
    session: ClientSession,
    orderId: string,
  ): Promise<{
    payment: PaymentFundingSummary
    attempts: {
      lastCheckedAt?: string
      expiresAt?: string
      amountDisposition:
        | 'not_checked'
        | 'matched'
        | 'under_collected'
        | 'over_collected'
        | 'quarantined'
      riskStatus: 'clear' | 'review' | 'rejected'
      verifiedReceiptAmountPoisha?: number | null
      id: string
      state:
        | 'pending'
        | 'created'
        | 'initiated'
        | 'uncertain'
        | 'verified_failed'
        | 'verified_cancelled'
        | 'verified_paid'
      expectedAmountPoisha: number
    }[]
  }>
}

type PaymentEligibility = (
  rawFlags: unknown,
  amountPoisha: number | undefined,
  session: ClientSession,
) => Promise<
  {
    channel: 'cod' | 'bkash' | 'nagad' | 'rocket'
    active: boolean
    eligible: boolean
    reasonCode?: string | undefined
    minPoisha?: number | undefined
    maxPoisha?: number | undefined
  }[]
>

type CancellationPaymentAccess = (
  session: ClientSession,
  input: { orderId: string; expectedPoisha: number; method: 'cod' | 'online' },
) => Promise<{ paymentId: string; verifiedCollectedPoisha: number }>

type FulfillmentPaymentAccess = ((
  session: ClientSession,
  input: { orderId: string; method: 'cod' | 'online'; expectedPoisha: number },
) => Promise<void>) & {
  fundedAt: (session: ClientSession, orderId: string) => Promise<string | undefined>
}

type CodCollectionService = {
  collect(
    token: string | undefined,
    rawId: unknown,
    raw: unknown,
    key: unknown,
  ): Promise<{
    id: string
    paymentId: string
    orderId: string
    provider: 'cod_manual'
    sourceKind: 'cod_manual'
    merchandiseAllocatedPoisha: number
    correctionAllocatedPoisha: number
    unassignedAllocatedPoisha: number
    merchandiseRefundHeldPoisha: number
    merchandiseRefundCompletedPoisha: number
    correctionRefundHeldPoisha: number
    correctionRefundCompletedPoisha: number
    amountPoisha: number
    currency: 'BDT'
    collectedAt: string
  }>
}

type RefundFundingAccess = {
  list(
    session: ClientSession,
    orderId: string,
    classification: 'merchandise' | 'payment_correction',
  ): Promise<{
    paymentId: string
    order: { allocatedPoisha: number; heldPoisha: number; completedPoisha: number }
    delivery: { heldPoisha: number; completedPoisha: number }
    sources: {
      allocatedPoisha: number
      heldPoisha: number
      completedPoisha: number
      collectedAt: Date
      verifiedAt: Date
      bankTranId?: string
      sourceCollectionId: string
      provider: 'sslcommerz' | 'cod_manual'
      merchantAccountKey: string
    }[]
  }>
  settle(session: ClientSession, raw: unknown): Promise<void>
  reserve(session: ClientSession, raw: unknown): Promise<void>
}

type PaymentReportAccess = (
  session: ClientSession,
  period: { from: Date; to: Date; asOf: Date },
  codOrderIds: string[],
) => Promise<{
  collections: {
    id: string
    amountPoisha: number
    collectedAt: string
    sourceKind: 'sslcommerz' | 'cod_manual'
    merchandisePoisha: number
    correctionPoisha: number
    unassignedPoisha: number
  }[]
  codBalances: { id: string; expectedPoisha: number; verifiedCollectedPoisha: number }[]
  unattributedProviderCashPoisha: number
  unassignedLinkedCashPoisha: number
}>

type CorrectionPaymentSnapshotAccess = (
  session: ClientSession,
  orderId: string,
  sourceCollectionId: string,
) => Promise<{
  source: { allocatedPoisha: number; heldPoisha: number; completedPoisha: number }
  order: { allocatedPoisha: number; heldPoisha: number; completedPoisha: number }
}>

type RefundPaymentSnapshotAccess = (
  session: ClientSession,
  orderId: string,
  sourceCollectionId: string,
) => Promise<{
  source: { allocatedPoisha: number; heldPoisha: number; completedPoisha: number }
  order: { allocatedPoisha: number; heldPoisha: number; completedPoisha: number }
  delivery: { heldPoisha: number; completedPoisha: number }
}>

export type {
  CancellationPaymentAccess,
  CodCollectionService,
  CorrectionPaymentSnapshotAccess,
  CustomerPaymentSummaryAccess,
  FulfillmentPaymentAccess,
  PaymentEligibility,
  PaymentGateway,
  PaymentReconciliation,
  PaymentReportAccess,
  RefundFundingAccess,
  RefundPaymentSnapshotAccess,
}
