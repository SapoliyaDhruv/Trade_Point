import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminCategoryService } from '../../services/admin-category.service';

@Component({
  selector: 'app-add-category',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.css']
})
export class AddCategoryComponent {
  categoryName = '';

  constructor(private categoryService: AdminCategoryService) {}

  addCategory() {
    if (!this.categoryName.trim()) return;

    this.categoryService.addCategory({ name: this.categoryName })
      .subscribe({
        next: () => {
          alert('Category added successfully');
          this.categoryName = '';
        },
        error: err => alert(err.error?.msg || 'Error adding category')
      });
  }
}
