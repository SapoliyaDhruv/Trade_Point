import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { apiUrl } from '../../../shared/utils/url';

interface Product {
  _id: string;
  name: string;
  category: { _id: string; name: string }; // populated
  ageYears: number;
  description: string;
  location: string;
  type: 'sale' | 'rent';
  salePriceMin?: number;
  salePriceMax?: number;
  rentPricePerHour?: number;
  rentPricePerDay?: number;
  latePenaltyPerDay?: number;
  photos: string[];
  billPhotos: string[];
  status: string;
}

@Component({
  selector: 'app-edit-product',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './edit-product.component.html',
  styleUrls: ['./edit-product.component.css']
})
export class EditProductComponent implements OnInit {
  productId: string | null = null;
  product: Product | null = null;
  editForm: FormGroup;
  isLoading = true;
  isSaving = false;
  errorMsg = '';
  successMsg = '';

  categories: any[] = []; // populated from API

  private apiUrl = apiUrl('/products/admin');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private fb: FormBuilder
  ) {
    this.editForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      category: ['', Validators.required],
      ageYears: ['', [Validators.required, Validators.min(0)]],
      description: ['', [Validators.required, Validators.minLength(10)]],
      location: ['', Validators.required],
      type: ['sale', Validators.required],
      salePriceMin: [{ value: '', disabled: true }, [Validators.min(1)]],
      salePriceMax: [{ value: '', disabled: true }, [Validators.min(1)]],
      rentPricePerHour: [{ value: '', disabled: true }, [Validators.min(0)]],
      rentPricePerDay: [{ value: '', disabled: true }, [Validators.min(1)]],
      latePenaltyPerDay: [{ value: '', disabled: true }, [Validators.min(0)]]
    });

    // Watch type changes to toggle fields
    this.editForm.get('type')?.valueChanges.subscribe(type => {
      this.togglePriceFields(type);
    });
  }

  ngOnInit() {
    this.productId = this.route.snapshot.paramMap.get('id');
    if (this.productId) {
      this.loadProduct();
      this.loadCategories();
    } else {
      this.errorMsg = 'No product ID provided in URL';
      this.isLoading = false;
    }
  }

  loadCategories() {
    this.http.get<any[]>(apiUrl('/categories')).subscribe({
      next: (data) => {
        this.categories = data.filter(c => c.status === 'active');
      },
      error: (err) => {
        console.error('Failed to load categories:', err);
        this.errorMsg = 'Failed to load categories';
      }
    });
  }

  loadProduct() {
    this.isLoading = true;
    this.http.get<Product>(`${this.apiUrl}/${this.productId}`).subscribe({
      next: (data) => {
        this.product = data;
        this.patchForm(data);
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMsg = err.error?.msg || 'Failed to load product details';
        this.isLoading = false;
      }
    });
  }

  patchForm(product: Product) {
    this.editForm.patchValue({
      name: product.name,
      category: product.category._id, // use _id for select
      ageYears: product.ageYears,
      description: product.description,
      location: product.location,
      type: product.type,
      salePriceMin: product.salePriceMin || '',
      salePriceMax: product.salePriceMax || '',
      rentPricePerHour: product.rentPricePerHour || '',
      rentPricePerDay: product.rentPricePerDay || '',
      latePenaltyPerDay: product.latePenaltyPerDay || ''
    });

    // Trigger conditional fields
    this.togglePriceFields(product.type);
  }

  togglePriceFields(type: 'sale' | 'rent') {
    const saleMin = this.editForm.get('salePriceMin');
    const saleMax = this.editForm.get('salePriceMax');
    const rentHour = this.editForm.get('rentPricePerHour');
    const rentDay = this.editForm.get('rentPricePerDay');
    const penalty = this.editForm.get('latePenaltyPerDay');

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
      rentHour?.setValidators([Validators.required, Validators.min(0)]);
      rentDay?.setValidators([Validators.required, Validators.min(1)]);
      penalty?.setValidators([Validators.required, Validators.min(0)]);
      saleMin?.clearValidators();
      saleMax?.clearValidators();
    }

    saleMin?.updateValueAndValidity();
    saleMax?.updateValueAndValidity();
    rentHour?.updateValueAndValidity();
    rentDay?.updateValueAndValidity();
    penalty?.updateValueAndValidity();
  }

  onSubmit() {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.successMsg = '';

    const formData = this.editForm.getRawValue();

    this.http.put(`${this.apiUrl}/${this.productId}`, formData).subscribe({
      next: () => {
        this.successMsg = 'Product updated successfully!';
        this.isSaving = false;
        setTimeout(() => {
          this.router.navigate(['/admin/products/manage']);
        }, 1500);
      },
      error: (err) => {
        this.errorMsg = err.error?.msg || 'Failed to update product';
        this.isSaving = false;
      }
    });
  }

  cancel() {
    this.router.navigate(['/admin/products/manage']);
  }
}
