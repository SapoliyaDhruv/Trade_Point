import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './verify-otp.component.html',
  styleUrls: ['./verify-otp.component.css']
})
export class VerifyOtpComponent implements OnInit {
  email = '';
  otp = '';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private router: Router
  ) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      if (!this.email) {
        alert('No email found. Please register again.');
      }
    });
  }

  verifyOtp() {
    if (!this.otp) {
      alert('Please enter OTP');
      return;
    }
    if (!this.email) {
      alert('Email missing. Start registration again.');
      return;
    }

    const payload = { email: this.email, otp: this.otp };

    this.http.post(apiUrl('/auth/verify-otp'), payload).subscribe({
      next: (res: any) => {
        alert(res.msg || 'Account verified! You can now login.');
        this.router.navigate(['/login']);
      },
      error: (err) => {
        console.error('Verify OTP error:', err);
        const msg = err.error?.msg || 'Verification failed';
        alert(msg);
      }
    });
  }
}
