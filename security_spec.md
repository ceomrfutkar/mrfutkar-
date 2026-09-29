# Security Specification: MR FUTKAR Firestore Rules

## 1. Data Invariants

1. **Retailer Profile Boundary**: A retailer document `retailers/{retailerId}` can only be read, created, or updated by the authenticated user whose `request.auth.uid == retailerId`. No retailer may access or modify another retailer's profile.
2. **Product & Catalogue Immutability**: Collections `products`, `brands`, `categories`, `warehouses`, and `businessSettings` are strictly read-only for retailers. Writes must be entirely denied from client applications.
3. **Order Ownership & Snapshot Integrity**: An order document `orders/{orderId}` must have `retailerId == request.auth.uid`. A retailer cannot list or view orders belonging to other retailers.
4. **Order State Modification Guard**: Retailers may ONLY update their own orders to cancel them, and only when the order status is currently in `PLACED`, `CONFIRMED`, or `ACCEPTED`. When updating, the only allowed affected keys are `orderStatus`, `cancellationReason`, `cancelledAt`, and `updatedAt`.
5. **Order Creation Validation**: Order documents created by a retailer must contain required fields (`orderId`, `retailerId`, `items`, `grandTotal`, `orderStatus`, `paymentMethod`) where `retailerId == request.auth.uid` and initial status is `PLACED`.
6. **Notification Isolation**: Retailer notifications in `notifications/{notificationId}` can only be read or queried by the recipient (`resource.data.retailerId == request.auth.uid`). Retailers can only update `isRead`.

## 2. The "Dirty Dozen" Vulnerability Payloads (Must be Denied)

1. **Spoofed Retailer Write**: Unauthenticated write to `retailers/ret-123`.
2. **Cross-Tenant Retailer Update**: User `UID_A` attempting to write to `retailers/UID_B`.
3. **Product Price Tampering**: User attempting to `update` a product document in `products/prod-001` with `sellingPrice: 1`.
4. **Catalogue Deletion**: User attempting to `delete` `brands/b-parle` or `categories/cat-biscuits`.
5. **Business Settings Hijack**: User attempting to write to `businessSettings/global` to change `minimumOrderValue: 0`.
6. **Warehouse Modification**: User attempting to create or delete records in `warehouses`.
7. **Cross-Tenant Order Reading**: User `UID_A` issuing a `get` on `orders/order-from-UID-B`.
8. **Unfiltered Orders List**: User `UID_A` querying `orders` collection without a `where("retailerId", "==", "UID_A")` filter.
9. **Post-Dispatch Order Cancellation**: User attempting to update an order with status `OUT_FOR_DELIVERY` to `CANCELLED`.
10. **Order Total Price Inflation/Deflation on Existing Order**: User attempting to modify `grandTotal` or `subtotal` of an already placed order.
11. **Order Creation as Another User**: User `UID_A` creating an order with `retailerId: "UID_B"`.
12. **Foreign Notification Snooping**: User `UID_A` reading notifications where `retailerId == "UID_B"`.
