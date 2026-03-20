import { Component, Inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { apiUrl } from '../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerDay?: number;
}

@Component({
  selector: 'app-offer-modal',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './offer-modal.component.html',
  styleUrl: './offer-modal.component.css'
})
export class OfferModalComponent implements OnDestroy {
  // Injected services
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);

  // Signals
  isSubmitting = signal(false);
  errorMsg = signal<string | null>(null);
  minDate = signal(new Date()); // Minimum date = today
  availabilityMsg = signal('');
  isDateAvailable = signal(true);
  checkingAvailability = signal(false);
  saleMinPrice = 1;
  fixedRentPrice = 0;

  // Form
  offerForm: FormGroup;
  private dateSub?: Subscription;

  constructor(
    public dialogRef: MatDialogRef<OfferModalComponent>,
    @Inject(MAT_DIALOG_DATA) public data: { product: Product }
  ) {
    this.saleMinPrice = Math.max(1, Number(this.data.product.salePriceMin || 1));
    this.fixedRentPrice = Math.max(0, Number(this.data.product.rentPricePerDay || 0));

    this.offerForm = this.fb.group({
      offerAmount: [null, [Validators.required, Validators.min(this.saleMinPrice)]],
      rentStartDate: [null],
      rentEndDate: [null],
      message: ['']
    });

    // Conditional validation for rent products
    if (this.data.product.type === 'rent') {
      this.offerForm.patchValue({ offerAmount: this.fixedRentPrice });
      this.offerForm.get('offerAmount')?.disable({ emitEvent: false });
      this.offerForm.get('rentStartDate')?.setValidators([Validators.required]);
      this.offerForm.get('rentEndDate')?.setValidators([Validators.required]);
      this.offerForm.get('rentStartDate')?.updateValueAndValidity();
      this.offerForm.get('rentEndDate')?.updateValueAndValidity();

      this.dateSub = this.offerForm.valueChanges.subscribe(() => this.checkAvailability());
    } else {
      this.offerForm.patchValue({ offerAmount: this.saleMinPrice });
    }
  }

  get isRent(): boolean {
    return this.data.product.type === 'rent';
  }

  onSubmit(): void {
    if (this.offerForm.invalid) {
      this.offerForm.markAllAsTouched();
      return;
    }

    if (this.isRent && !this.isDateAvailable()) {
      this.errorMsg.set('Selected rent dates are not available.');
      return;
    }

    if (this.isRent && this.fixedRentPrice <= 0) {
      this.errorMsg.set('This rental product has invalid fixed rent price.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMsg.set(null);

    // ✅ FIX: Map product.type to correct offerType
    // product.type: 'sale' → offerType: 'SELL'
    // product.type: 'rent' → offerType: 'RENT'
    const offerType = this.data.product.type === 'sale' ? 'SELL' : 'RENT';

    const formValue = this.offerForm.getRawValue();
    const payload = {
      productId: this.data.product._id,
      offerType: offerType,
      offerAmount: this.isRent ? this.fixedRentPrice : formValue.offerAmount,
      rentStartDate: this.isRent ? formValue.rentStartDate : undefined,
      rentEndDate: this.isRent ? formValue.rentEndDate : undefined,
      message: formValue.message || undefined
    };

    console.log('Sending offer payload:', payload); // Debugging

    this.http.post(apiUrl('/offers'), payload).subscribe({
      next: (response: any) => {
        console.log('Offer created successfully:', response);
        this.isSubmitting.set(false);
        this.dialogRef.close(response); // Success - close modal
      },
      error: (err: any) => {
        console.error('Offer creation error:', err);
        this.isSubmitting.set(false);
        this.errorMsg.set(err.error?.msg || 'Failed to send offer. Please try again.');
      }
    });
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.dateSub?.unsubscribe();
  }

  private checkAvailability(): void {
    if (!this.isRent) {
      return;
    }

    const start = this.offerForm.value.rentStartDate;
    const end = this.offerForm.value.rentEndDate;
    if (!start || !end) {
      this.availabilityMsg.set('');
      this.isDateAvailable.set(true);
      return;
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (startDate >= endDate) {
      this.availabilityMsg.set('End date must be after start date.');
      this.isDateAvailable.set(false);
      return;
    }

    this.checkingAvailability.set(true);

    const params = new HttpParams()
      .set('startDate', startDate.toISOString())
      .set('endDate', endDate.toISOString());

    this.http.get<any>(apiUrl(`/products/${this.data.product._id}/rental-availability`), { params })
      .subscribe({
        next: (res) => {
          const available = Boolean(res?.available);
          this.isDateAvailable.set(available);
          this.availabilityMsg.set(available ? 'Dates are available.' : 'Selected dates are already booked.');
          this.checkingAvailability.set(false);
        },
        error: () => {
          this.isDateAvailable.set(false);
          this.availabilityMsg.set('Unable to validate date availability right now.');
          this.checkingAvailability.set(false);
        }
      });
  }
}
