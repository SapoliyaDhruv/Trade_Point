import { Component, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { CategoryService } from '../../shared/services/category.service';
import { apiUrl } from '../../shared/utils/url';

// Better typing
interface Category {
  _id: string;
  name: string;
  status: 'active' | 'inactive';
}

@Component({
  selector: 'app-add-product',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './add-product.component.html',
  styleUrls: ['./add-product.component.css']
})
export class AddProductComponent implements OnInit {
  form: FormGroup;
  categories: Category[] = [];
  photoPreviews: string[] = [];
  billPreviews: string[] = [];
  errorMsg = '';
  photoError = '';
  billError = '';
  private readonly maxPhotoSize = 2 * 1024 * 1024;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private categoryService: CategoryService   // ← now using the shared/read-only service
  ) {
    this.form = this.fb.group({
      name:          ['', [Validators.required, Validators.minLength(3)]],
      category:      ['', Validators.required],
      ageYears:      ['', [Validators.required, Validators.min(0)]],
      photos:        [null, Validators.required],
      billPhotos:    [null],
      type:          ['sale', Validators.required],
      salePriceMin:  [{ value: '', disabled: false }],
      salePriceMax:  [{ value: '', disabled: false }],
      rentPricePerHour:  [{ value: '', disabled: true }],
      rentPricePerDay:   [{ value: '', disabled: true }],
      latePenaltyPerDay: [{ value: '', disabled: true }],
      location:      ['', Validators.required],
      description:   ['', [Validators.required, Validators.minLength(20)]],
    }, { validators: this.priceValidator.bind(this) });  // bind context
  }

  ngOnInit(): void {
    this.loadCategories();

    this.form.get('type')?.valueChanges.subscribe(type => {
      this.updatePriceControls(type as 'sale' | 'rent');
    });

    // Initial setup based on default value
    this.updatePriceControls(this.form.get('type')?.value);
  }

  private loadCategories(): void {
  this.categoryService.getCategories().subscribe({
    next: (res: Category[]) => {
      this.categories = res.filter(c => c.status === 'active');
      console.log("Categories loaded:", this.categories); // ← helpful
    },
    error: (err) => {
      console.error("CATEGORY LOAD ERROR:", err);          // ← very important
      alert('Cannot load categories: ' + (err.error?.msg || err.message || 'Check console'));
    }
  });
}

  private updatePriceControls(type: 'sale' | 'rent'): void {
    const saleMin = this.form.get('salePriceMin');
    const saleMax = this.form.get('salePriceMax');
    const rentHour = this.form.get('rentPricePerHour');
    const rentDay  = this.form.get('rentPricePerDay');
    const penalty  = this.form.get('latePenaltyPerDay');

    if (type === 'sale') {
      saleMin?.enable();
      saleMax?.enable();
      rentHour?.disable();
      rentDay?.disable();
      penalty?.disable();

      saleMin?.setValidators([Validators.required, Validators.min(1)]);
      saleMax?.setValidators([Validators.required, Validators.min(1)]);
      rentHour?.clearValidators();
      rentDay?.clearValidators();
      penalty?.clearValidators();
    } else {
      saleMin?.disable();
      saleMax?.disable();
      rentHour?.enable();
      rentDay?.enable();
      penalty?.enable();

      rentDay?.setValidators([Validators.required, Validators.min(1)]);
      penalty?.setValidators([Validators.required, Validators.min(0)]);
      saleMin?.clearValidators();
      saleMax?.clearValidators();
    }

    // Re-validate after changes
    saleMin?.updateValueAndValidity({ emitEvent: false });
    saleMax?.updateValueAndValidity({ emitEvent: false });
    rentHour?.updateValueAndValidity({ emitEvent: false });
    rentDay?.updateValueAndValidity({ emitEvent: false });
    penalty?.updateValueAndValidity({ emitEvent: false });
  }

  private priceValidator(group: AbstractControl): { [key: string]: boolean } | null {
    const type = group.get('type')?.value;
    if (type !== 'sale') return null;

    const min = Number(group.get('salePriceMin')?.value);
    const max = Number(group.get('salePriceMax')?.value);

    if (min && max && min > max) {
      group.get('salePriceMax')?.setErrors({ minGreaterThanMax: true });
      return { minGreaterThanMax: true };
    }

    // Clear error if condition is fixed
    if (group.get('salePriceMax')?.hasError('minGreaterThanMax')) {
      group.get('salePriceMax')?.setErrors(null);
    }

    return null;
  }

  onPhotosChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get('photos');
    this.photoError = '';
    this.clearControlError(control, 'photosCount');
    this.clearControlError(control, 'photosType');
    this.clearControlError(control, 'photosSize');

    if (!input.files?.length) {
      control?.setValue(null);
      this.photoPreviews = [];
      return;
    }

    const files = Array.from(input.files);
    if (files.length < 2 || files.length > 5) {
      this.photoError = 'Please select between 2 and 5 photos.';
      this.setControlError(control, 'photosCount');
      control?.setValue(null);
      this.photoPreviews = [];
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.photoError = 'Only image files are allowed.';
        this.setControlError(control, 'photosType');
        control?.setValue(null);
        this.photoPreviews = [];
        return;
      }
      if (file.size > this.maxPhotoSize) {
        this.photoError = 'Each photo must be under 2MB.';
        this.setControlError(control, 'photosSize');
        control?.setValue(null);
        this.photoPreviews = [];
        return;
      }
    }

    this.errorMsg = '';
    this.photoPreviews = [];
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e: any) => this.photoPreviews.push(e.target.result);
      reader.readAsDataURL(file);
    }
    control?.setValue(files);
  }

  onBillPhotosChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const control = this.form.get('billPhotos');
    this.billError = '';
    this.clearControlError(control, 'billCount');
    this.clearControlError(control, 'billType');
    this.clearControlError(control, 'billSize');

    if (!input.files?.length) {
      control?.setValue(null);
      this.billPreviews = [];
      return;
    }

    const files = Array.from(input.files);
    if (files.length > 2) {
      this.billError = 'Maximum 2 bill photos allowed.';
      this.setControlError(control, 'billCount');
      this.billPreviews = [];
      control?.setValue(null);
      return;
    }

    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        this.billError = 'Only image files are allowed.';
        this.setControlError(control, 'billType');
        this.billPreviews = [];
        control?.setValue(null);
        return;
      }
      if (file.size > this.maxPhotoSize) {
        this.billError = 'Each bill photo must be under 2MB.';
        this.setControlError(control, 'billSize');
        this.billPreviews = [];
        control?.setValue(null);
        return;
      }
    }

    this.errorMsg = '';
    this.billPreviews = [];
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (e: any) => this.billPreviews.push(e.target.result);
      reader.readAsDataURL(file);
    }
    control?.setValue(files);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const fd = new FormData();

    fd.append('name', this.form.value.name.trim());
    fd.append('category', this.form.value.category);
    fd.append('ageYears', this.form.value.ageYears);
    fd.append('description', this.form.value.description.trim());
    fd.append('location', this.form.value.location.trim());
    fd.append('type', this.form.value.type);

    if (this.form.value.type === 'sale') {
      fd.append('salePriceMin', this.form.value.salePriceMin);
      fd.append('salePriceMax', this.form.value.salePriceMax);
    } else {
      // Optional fields for rent
      if (this.form.value.rentPricePerHour) {
        fd.append('rentPricePerHour', this.form.value.rentPricePerHour);
      }
      fd.append('rentPricePerDay', this.form.value.rentPricePerDay);
      fd.append('latePenaltyPerDay', this.form.value.latePenaltyPerDay);
    }

    const photos = this.form.get('photos')?.value as File[] ?? [];
    photos.forEach(file => fd.append('photos', file));

    const bills = this.form.get('billPhotos')?.value as File[] ?? [];
    bills.forEach(file => fd.append('billPhotos', file));

    this.http.post(apiUrl('/products'), fd).subscribe({
      next: () => {
        alert('Product submitted successfully! Waiting for admin approval.');
        this.resetForm();
      },
      error: (err) => {
        console.error('Product submission error:', err);
        alert(err.error?.msg || 'Error submitting product. Please try again.');
      }
    });
  }

  private resetForm(): void {
    this.form.reset({ type: 'sale' });
    this.form.get('type')?.setValue('sale'); // ensure default
    this.photoPreviews = [];
    this.billPreviews = [];
    this.errorMsg = '';
    this.photoError = '';
    this.billError = '';
  }
  
  private setControlError(control: AbstractControl | null, key: string): void {
    if (!control) return;
    const errors = control.errors || {};
    errors[key] = true;
    control.setErrors(errors);
  }

  private clearControlError(control: AbstractControl | null, key: string): void {
    if (!control || !control.errors?.[key]) return;
    const errors = { ...control.errors };
    delete errors[key];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }
}
