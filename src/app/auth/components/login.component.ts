import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';  
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  email = '';
  password = '';
  errorMsg = '';
  infoMsg = '';
  loading = false;

  forgotMode = false;
  resetEmail = '';
  resetOtp = '';
  newPassword = '';
  confirmPassword = '';

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  login() {
    if (!this.email || !this.password) {
      this.errorMsg = 'Please enter email and password';
      return;
    }

    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    this.authService.login({ email: this.email, password: this.password })
      .pipe(finalize(() => { this.loading = false; }))
      .subscribe({
        next: (res) => {
          if (res.role === 'admin') {
            this.router.navigate(['/admin/dashboard']);
          } else {
            this.router.navigate(['/user/dashboard']);
          }
        },
        error: (err) => {
          console.error('Login error:', err);
          this.errorMsg = err.error?.msg || 'Login failed. Please check your credentials.';
        }
      });
  }

  openForgotPassword() {
    this.forgotMode = true;
    this.errorMsg = '';
    this.infoMsg = '';
    this.resetEmail = this.email || '';
  }

  backToLogin() {
    this.forgotMode = false;
    this.errorMsg = '';
    this.infoMsg = '';
    this.resetOtp = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  sendResetOtp() {
    if (!this.resetEmail) {
      this.errorMsg = 'Enter your email to receive OTP';
      return;
    }

    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    this.authService.requestPasswordReset(this.resetEmail)
      .pipe(finalize(() => { this.loading = false; }))
      .subscribe({
        next: (res) => {
          this.infoMsg = res.msg || 'Reset OTP sent to your email.';
        },
        error: (err) => {
          this.errorMsg = err.error?.msg || 'Failed to send reset OTP';
        }
      });
  }

  resetPasswordNow() {
    if (!this.resetEmail || !this.resetOtp || !this.newPassword) {
      this.errorMsg = 'Email, OTP and new password are required';
      return;
    }

    if (this.newPassword.length < 6) {
      this.errorMsg = 'New password must be at least 6 characters';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.errorMsg = 'Password and confirm password do not match';
      return;
    }

    this.errorMsg = '';
    this.infoMsg = '';
    this.loading = true;

    this.authService.resetPassword({
      email: this.resetEmail,
      otp: this.resetOtp,
      newPassword: this.newPassword
    })
      .pipe(finalize(() => { this.loading = false; }))
      .subscribe({
        next: (res) => {
          this.infoMsg = res.msg || 'Password reset successful. Please login.';
          this.email = this.resetEmail;
          this.backToLogin();
          this.infoMsg = res.msg || 'Password reset successful. Please login.';
        },
        error: (err) => {
          this.errorMsg = err.error?.msg || 'Failed to reset password';
        }
      });
  }
}
