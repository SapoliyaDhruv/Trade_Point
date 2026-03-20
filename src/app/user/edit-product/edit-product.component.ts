import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { UserSidebarComponent } from '../sidebar/user-sidebar.component';
import { apiUrl } from '../../shared/utils/url';

@Component({
  selector: 'app-user-edit-product',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UserSidebarComponent
  ],
  templateUrl: './edit-product.component.html',
  styleUrls: ['./edit-product.component.css']
})
export class UserEditProductComponent implements OnInit {

  productId!: string;
  editForm!: FormGroup;
  isLoading = true;
  isSaving = false;
  errorMsg = '';
  successMsg = '';

  categories: any[] = [];

  // Correct endpoint for user's own product
  private apiUrl = apiUrl('/products/user');

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private fb: FormBuilder
  ) {
    this.initForm();
  }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');

    if (!id) {
      this.errorMsg = 'Product ID is missing in the URL';
      this.isLoading = false;
      return;
    }

    this.productId = id;

    this.loadCategories();
    this.loadProduct();
  }

  private initForm() {
    this.editForm = this.fb.group({
      name:          ['', [Validators.required, Validators.minLength(3)]],
      category:      ['', Validators.required],
      ageYears:      [0,  [Validators.required, Validators.min(0)]],
      description:   ['', [Validators.required, Validators.minLength(10)]],
      location:      ['', Validators.required],
      type:          ['sale', Validators.required],

      // Sale fields
      salePriceMin:  [{ value: '', disabled: true }, [Validators.min(1)]],
      salePriceMax:  [{ value: '', disabled: true }, [Validators.min(1)]],

      // Rent fields
      rentPricePerHour:  [{ value: '', disabled: true }, [Validators.min(0)]],
      rentPricePerDay:   [{ value: '', disabled: true }, [Validators.min(1)]],
      latePenaltyPerDay: [{ value: '', disabled: true }, [Validators.min(0)]],
    });

    // Watch type changes to enable/disable correct price fields
    this.editForm.get('type')?.valueChanges.subscribe(type => {
      this.togglePriceFields(type);
    });
  }

  private togglePriceFields(type: string) {
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

      // Set required validators only for active fields
      saleMin?.setValidators([Validators.required, Validators.min(1)]);
      saleMax?.setValidators([Validators.required, Validators.min(1)]);
      rentHour?.clearValidators();
      rentDay?.clearValidators();
      penalty?.clearValidators();
    } else { // rent
      saleMin?.disable();
      saleMax?.disable();
      rentHour?.enable();
      rentDay?.enable();
      penalty?.enable();

      rentHour?.setValidators([Validators.min(0)]);
      rentDay?.setValidators([Validators.required, Validators.min(1)]);
      penalty?.setValidators([Validators.min(0)]);
      saleMin?.clearValidators();
      saleMax?.clearValidators();
    }

    // Important: re-validate after changes
    saleMin?.updateValueAndValidity();
    saleMax?.updateValueAndValidity();
    rentHour?.updateValueAndValidity();
    rentDay?.updateValueAndValidity();
    penalty?.updateValueAndValidity();
  }

  loadCategories() {
    this.http.get<any[]>(apiUrl('/categories'))
      .subscribe({
        next: (data) => {
          this.categories = data.filter(c => c.status === 'active');
        },
        error: (err) => {
          console.error('Failed to load categories', err);
          this.errorMsg = 'Cannot load categories';
        }
      });
  }

  loadProduct() {
    this.isLoading = true;
    this.errorMsg = '';

    this.http.get<any>(`${this.apiUrl}/${this.productId}`).subscribe({
      next: (product) => {
        // Patch all fields that exist
        this.editForm.patchValue({
          name: product.name,
          category: product.category?._id || product.category, // important: use _id for select
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

        // Make sure correct price fields are enabled/disabled
        this.togglePriceFields(product.type);

        this.isLoading = false;
      },
      error: (err) => {
        console.error('Product load error:', err);
        this.errorMsg = err.error?.msg || 
          'Failed to load product. It may not exist, not belong to you, or you are not logged in.';
        this.isLoading = false;
      }
    });
  }

  save() {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.errorMsg = '';
    this.successMsg = '';

    const formValue = this.editForm.getRawValue(); // getRawValue includes disabled fields

    this.http.put(`${this.apiUrl}/${this.productId}`, formValue).subscribe({
      next: () => {
        this.successMsg = 'Product updated successfully!';
        this.isSaving = false;
        setTimeout(() => {
          this.router.navigate(['/user/listings']);
        }, 1200);
      },
      error: (err) => {
        this.errorMsg = err.error?.msg || 'Failed to update product';
        this.isSaving = false;
        console.error('Update failed:', err);
      }
    });
  }

  cancel() {
    this.router.navigate(['/user/listings']);
  }
}
