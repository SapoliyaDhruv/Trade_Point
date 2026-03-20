import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../auth/auth.service';
import { apiUrl, assetUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-admin-profile',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-profile.component.html',
  styleUrls: ['./admin-profile.component.css']
})
export class AdminProfileComponent implements OnInit {

  profileForm: FormGroup;
  passwordForm: FormGroup;

  currentUser: any = null;
  photoPreview: string | null = null;
  selectedPhoto: File | null = null;
  photoError = '';

  isLoading = false;
  successMsg = '';
  errorMsg = '';

  private apiBase = apiUrl('/users');

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordsMustMatch });

    // Re-validate form on every change (for password matching)
    this.passwordForm.valueChanges.subscribe(() => {
      this.passwordForm.updateValueAndValidity();
    });
  }

  ngOnInit() {
    this.loadUserProfile();
  }

  private loadUserProfile() {
    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    this.authService.fetchCurrentUser().subscribe({
      next: (user) => {
        console.log('[Admin Profile] User loaded:', user);
        this.currentUser = user;
        this.profileForm.patchValue({
          firstName: user.firstName || '',
          lastName: user.lastName || ''
        });

        // Show uploaded photo from server (or default)
        this.photoPreview = user.profilePhoto
          ? assetUrl(user.profilePhoto.replace(/\\/g, '/'))
          : 'assets/default-avatar.png';

        this.isLoading = false;
      },
      error: (err) => {
        console.error('[Admin Profile] Load failed:', err.status, err.message, err.error);
        this.errorMsg = err.status === 401 || err.status === 403
          ? 'Session expired. Please log in again.'
          : 'Could not load profile.';
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
      this.photoError = '';
      if (!file.type.startsWith('image/') || file.size > 2 * 1024 * 1024) {
        this.photoError = 'Invalid file. Use JPG/PNG under 2MB.';
        this.selectedPhoto = null;
        return;
      }

      this.selectedPhoto = file;
      const reader = new FileReader();
      reader.onload = () => this.photoPreview = reader.result as string;
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid) return;

    this.isLoading = true;
    this.errorMsg = '';
    this.successMsg = '';

    const fd = new FormData();
    fd.append('firstName', this.profileForm.value.firstName.trim());
    fd.append('lastName', this.profileForm.value.lastName.trim());
    if (this.selectedPhoto) fd.append('profilePhoto', this.selectedPhoto);

    this.http.put(`${this.apiBase}/profile`, fd).subscribe({
      next: () => {
        this.successMsg = 'Profile updated successfully!';
        this.selectedPhoto = null; // Clear local file

        // IMPORTANT: Refresh user data so photoPreview updates with server path
        this.authService.fetchCurrentUser().subscribe(() => {
          this.loadUserProfile(); // Reload profile with latest data (including new photo)
        });

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
    this.passwordForm.markAllAsTouched();

    if (this.passwordForm.invalid) {
      this.errorMsg = 'Please fill all password fields correctly and ensure they match.';
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
        console.error('Password change failed:', err);
        this.errorMsg = err.error?.msg || 'Failed to change password. Check current password.';
        this.isLoading = false;
      }
    });
  }

  logout() {
    this.authService.logout();
  }

  private passwordsMustMatch(g: FormGroup) {
    const newPass = g.get('newPassword')?.value;
    const confirmControl = g.get('confirmPassword');
    const confirmPass = confirmControl?.value;

    if (!confirmControl) return null;

    const errors = confirmControl.errors || {};

    if (newPass && confirmPass && newPass !== confirmPass) {
      confirmControl.setErrors({ ...errors, mismatch: true });
      return { mismatch: true };
    }

    if (errors['mismatch']) {
      delete errors['mismatch'];
      const hasOtherErrors = Object.keys(errors).length > 0;
      confirmControl.setErrors(hasOtherErrors ? errors : null);
    }

    return null;
  }

  get roleDisplay() {
    return this.currentUser?.role === 'admin' ? 'Admin' : 'User';
  }
}
