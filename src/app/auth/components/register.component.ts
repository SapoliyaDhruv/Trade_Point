import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule,RouterModule  ],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent {
  firstName = '';
  lastName  = '';
  email     = '';
  password  = '';

  constructor(
    private http: HttpClient,
    private router: Router
  ) {}

  register() {
    if (!this.firstName || !this.lastName || !this.email || !this.password) {
      alert('Please fill all fields');
      return;
    }

    const payload = {
      firstName: this.firstName,
      lastName: this.lastName,
      email: this.email,
      password: this.password
    };

    this.http.post(apiUrl('/auth/register'), payload).subscribe({
      next: (res: any) => {
        alert(res.msg || 'OTP sent! Check your email.');
        this.router.navigate(['/verify-otp'], { queryParams: { email: this.email } });
      },
      error: (err) => {
        console.error('Registration error:', err);
        const msg = err.error?.msg || err.message || 'Registration failed';
        alert(msg);
      }
    });
  }
}
