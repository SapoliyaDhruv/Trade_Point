import { Routes } from '@angular/router';

import { HomeComponent } from './home/home.component';
import { RegisterComponent } from './auth/components/register.component';
import { VerifyOtpComponent } from './auth/components/verify-otp.component';
import { LoginComponent } from './auth/components/login.component';

import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { UserLayoutComponent } from './layouts/user-layout/user-layout.component';

import { AdminDashboardComponent } from './admin/dashboard/admin-dashboard.component';
import { AdminProfileComponent } from './admin/profile/admin-profile.component';
import { AdminManageUsersComponent } from './admin/manage-users/admin-manage-users.component';
import { AddCategoryComponent } from './admin/category/add/add-category.component';
import { ManageCategoryComponent } from './admin/category/manage/manage-category.component';
import { ApproveProductsComponent } from './admin/product/approve/approve-products.component';
import { ManageProductsComponent } from './admin/product/manage/manage-products.component';
import { EditProductComponent } from './admin/product/edit/edit-product.component';
import { PendingTransactionsComponent } from './admin/pending-transactions/pending-transactions.component';
import { AdminEarningsReportsComponent } from './admin/reports/earnings-reports.component';
import { AdminAuditLogsComponent } from './admin/audit-logs/admin-audit-logs.component';
import { AdminChatComponent } from './admin/chat/admin-chat.component';

import { UserDashboardComponent } from './user/dashboard/user-dashboard.component';
import { UserProfileComponent } from './user/profile/user-profile.component';
import { AddProductComponent } from './user/add-product/add-product.component';
import { ListingsComponent } from './user/listings/listings.component';
import { BrowseProductsComponent } from './user/browse-products/browse-products.component';
import { ProductDetailsComponent } from './user/product-details/product-details.component';
import { UserEditProductComponent } from './user/edit-product/edit-product.component';
import { OffersReceivedComponent } from './user/offers/offers-received.component'; // ← CORRECT IMPORT
import { MyOffersComponent } from './user/my-offers/my-offers.component';
import { FakePaymentComponent } from './user/fake-payment/fake-payment.component';
import { MyRentalsComponent } from './user/my-rentals/my-rentals.component';
import { WalletLedgerComponent } from './user/wallet-ledger/wallet-ledger.component';
import { WishlistComponent } from './user/wishlist/wishlist.component';
import { RecentlyViewedComponent } from './user/recently-viewed/recently-viewed.component';
import { UserNotificationsComponent } from './user/notifications/user-notifications.component';
import { OfferChatComponent } from './user/offer-chat/offer-chat.component';

export const routes: Routes = [
  { path: '', component: HomeComponent },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent },
  { path: 'verify-otp', component: VerifyOtpComponent },
  { path: 'browse', component: BrowseProductsComponent },
  { path: 'product/:id', component: ProductDetailsComponent },

  {
    path: 'admin',
    component: AdminLayoutComponent,
    children: [
      { path: 'dashboard', component: AdminDashboardComponent },
      { path: 'profile', component: AdminProfileComponent },
      { path: 'manage-users', component: AdminManageUsersComponent },
      { path: 'category/add', component: AddCategoryComponent },
      { path: 'category/manage', component: ManageCategoryComponent },
      { path: 'products/approve', component: ApproveProductsComponent },
      { path: 'products/manage', component: ManageProductsComponent },
      { path: 'products/edit/:id', component: EditProductComponent },
      { path: 'pending-transactions', component: PendingTransactionsComponent },
      { path: 'reports/earnings', component: AdminEarningsReportsComponent },
      { path: 'audit-logs', component: AdminAuditLogsComponent },
      { path: 'chat', component: AdminChatComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },

  {
    path: 'user',
    component: UserLayoutComponent,
    children: [
      { path: 'dashboard', component: UserDashboardComponent },
      { path: 'profile', component: UserProfileComponent },
      { path: 'add-product', component: AddProductComponent },
      { path: 'listings', component: ListingsComponent },
      { path: 'browse-products', component: BrowseProductsComponent },
      { path: 'product/:id', component: ProductDetailsComponent },
      { path: 'edit-product/:id', component: UserEditProductComponent },
      { path: 'offers', component: OffersReceivedComponent },
      { path: 'my-offers', component: MyOffersComponent },
      { path: 'fake-payment/:transactionId', component: FakePaymentComponent },
      { path: 'rentals', component: MyRentalsComponent },
      { path: 'wallet', component: WalletLedgerComponent },
      { path: 'wishlist', component: WishlistComponent },
      { path: 'recently-viewed', component: RecentlyViewedComponent },
      { path: 'notifications', component: UserNotificationsComponent },
      { path: 'offer-chat/:id', component: OfferChatComponent },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: '' }
];
