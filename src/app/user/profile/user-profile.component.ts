import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { Router } from '@angular/router';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './user-profile.component.html',
  styleUrls: ['./user-profile.component.css']
})
export class UserProfileComponent implements OnInit {

  profileForm: FormGroup;
  passwordForm: FormGroup;

  currentUser: any = null;
  photoPreview: string | null = null;
  selectedPhoto: File | null = null;

  isLoading = false;
  successMsg = '';
  errorMsg = '';

  private apiBase = apiUrl('/users');

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService,
    private router: Router
  ) {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      payoutMethod: ['none'],
      accountHolderName: [''],
      bankName: [''],
      accountNumber: [''],
      ifscCode: [''],
      upiId: ['']
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordsMustMatch });

    // Add value change listener to re-validate on every change
    this.passwordForm.valueChanges.subscribe(() => {
      this.passwordForm.updateValueAndValidity();
    });

    this.profileForm.get('payoutMethod')?.valueChanges.subscribe((method) => {
      this.applyPayoutValidators(method || 'none');
    });
    this.applyPayoutValidators(this.profileForm.get('payoutMethod')?.value || 'none');
  }

  ngOnInit() {
    console.log('[User Profile] ngOnInit → starting fetch');

    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    this.authService.fetchCurrentUser().subscribe({
      next: (user) => {
        console.log('[User Profile] User loaded successfully:', user);
        this.currentUser = user;
        this.profileForm.patchValue({
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          payoutMethod: user.payoutDetails?.payoutMethod || 'none',
          accountHolderName: user.payoutDetails?.accountHolderName || '',
          bankName: user.payoutDetails?.bankName || '',
          accountNumber: user.payoutDetails?.accountNumber || '',
          ifscCode: user.payoutDetails?.ifscCode || '',
          upiId: user.payoutDetails?.upiId || ''
        });
        this.applyPayoutValidators(user.payoutDetails?.payoutMethod || 'none');

        this.photoPreview = user.profilePhoto
          ? assetUrl(user.profilePhoto.replace(/\\/g, '/'))
          : 'assets/default-avatar.png';

        this.isLoading = false;
      },
      error: (err) => {
        console.error('[User Profile] Failed to load user:', err.status, err.message, err.error);
        this.errorMsg = err.status === 401 || err.status === 403
          ? 'Your session has expired. Please log in again.'
          : 'Could not load profile. Please try again later.';
        this.isLoading = false;

        if (err.status === 401 || err.status === 403) {
          setTimeout(() => this.authService.logout(), 2000);
        }
      }
    });
  }

  onPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files?.[0]) {
      const file = input.files[0];
      if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
        this.errorMsg = 'Invalid file. Please use an image file smaller than 2MB.';
        return;
      }

      this.selectedPhoto = file;
      const reader = new FileReader();
      reader.onload = () => this.photoPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    if (this.profileForm.invalid) return;

    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    const fd = new FormData();
    fd.append('firstName', this.profileForm.value.firstName.trim());
    fd.append('lastName', this.profileForm.value.lastName.trim());
    fd.append('payoutMethod', this.profileForm.value.payoutMethod || 'none');
    fd.append('accountHolderName', (this.profileForm.value.accountHolderName || '').trim());
    fd.append('bankName', (this.profileForm.value.bankName || '').trim());
    fd.append('accountNumber', (this.profileForm.value.accountNumber || '').replace(/\s+/g, ''));
    fd.append('ifscCode', (this.profileForm.value.ifscCode || '').trim().toUpperCase());
    fd.append('upiId', (this.profileForm.value.upiId || '').trim().toLowerCase());
    if (this.selectedPhoto) fd.append('profilePhoto', this.selectedPhoto);

    this.http.put(`${this.apiBase}/profile`, fd).subscribe({
      next: () => {
        this.successMsg = 'Profile updated successfully!';
        this.authService.fetchCurrentUser().subscribe();
        this.selectedPhoto = null;
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Profile update failed:', err);
        this.errorMsg = err.error?.msg || 'Failed to update profile.';
        this.isLoading = false;
      }
    });
  }

  changePassword() {
    // Force validation check
    this.passwordForm.markAllAsTouched();

    if (this.passwordForm.invalid) {
      this.errorMsg = 'Please fill all password fields correctly and make sure new passwords match.';
      return;
    }

    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    const { currentPassword, newPassword } = this.passwordForm.value;

    this.http.put(`${this.apiBase}/change-password`, { currentPassword, newPassword }).subscribe({
      next: () => {
        this.successMsg = 'Password changed successfully!';
        this.passwordForm.reset();
        this.isLoading = false;
      },
      error: (err) => {
        console.error('Password change failed:', err.status, err.error);
        this.errorMsg = err.error?.msg || 'Failed to change password. Please check your current password.';
        this.isLoading = false;
      }
    });
  }

  logout() {
    this.authService.logout();
  }

  private passwordsMustMatch(g: FormGroup) {
    const newPass = g.get('newPassword')?.value;
    const confirmPass = g.get('confirmPassword')?.value;

    if (newPass && confirmPass && newPass !== confirmPass) {
      g.get('confirmPassword')?.setErrors({ mismatch: true });
      return { mismatch: true };
    } else {
      g.get('confirmPassword')?.setErrors(null);
      return null;
    }
  }

  get roleDisplay() {
    return this.currentUser?.role === 'admin' ? 'Admin' : 'User';
  }

  get isBankMethod(): boolean {
    return this.profileForm.get('payoutMethod')?.value === 'bank';
  }

  get isUpiMethod(): boolean {
    return this.profileForm.get('payoutMethod')?.value === 'upi';
  }

  private applyPayoutValidators(method: 'none' | 'bank' | 'upi' | string): void {
    const accountHolderName = this.profileForm.get('accountHolderName');
    const bankName = this.profileForm.get('bankName');
    const accountNumber = this.profileForm.get('accountNumber');
    const ifscCode = this.profileForm.get('ifscCode');
    const upiId = this.profileForm.get('upiId');

    accountHolderName?.clearValidators();
    bankName?.clearValidators();
    accountNumber?.clearValidators();
    ifscCode?.clearValidators();
    upiId?.clearValidators();

    if (method === 'bank') {
      accountHolderName?.setValidators([Validators.required, Validators.minLength(2)]);
      bankName?.setValidators([Validators.required, Validators.minLength(2)]);
      accountNumber?.setValidators([Validators.required, Validators.pattern(/^\d{6,20}$/)]);
      ifscCode?.setValidators([Validators.required, Validators.pattern(/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/)]);
    } else if (method === 'upi') {
      upiId?.setValidators([Validators.required, Validators.pattern(/^[\w.-]{2,}@[A-Za-z]{2,}$/)]);
    }

    accountHolderName?.updateValueAndValidity({ emitEvent: false });
    bankName?.updateValueAndValidity({ emitEvent: false });
    accountNumber?.updateValueAndValidity({ emitEvent: false });
    ifscCode?.updateValueAndValidity({ emitEvent: false });
    upiId?.updateValueAndValidity({ emitEvent: false });
  }
}
