import { Component, OnInit } from '@angular/core';
import { AdminCategoryService } from '../../services/admin-category.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-manage-category',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './manage-category.component.html',
  styleUrls: ['./manage-category.component.css']
})

// ...

export class ManageCategoryComponent implements OnInit {
  categories: any[] = [];

  constructor(private categoryService: AdminCategoryService) {}

  ngOnInit() {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getCategories().subscribe({
      next: (res) => this.categories = res || [],
      error: (err) => {
        console.error(err);
        alert(err.error?.msg || 'Cannot load categories');
      }
    });
  }

  toggleStatus(category: any) {
    const newStatus = category.status === 'active' ? 'inactive' : 'active';

    if (!confirm(`Really ${newStatus} "${category.name}"?`)) return;

    this.categoryService.toggleStatus(category._id, newStatus).subscribe({
      next: () => {
        category.status = newStatus;           // optimistic update
        // or: this.loadCategories();          // safer but slower
      },
      error: (err) => {
        console.error(err);
        alert(err.error?.msg || 'Failed to update status');
      }
    });
  }

  // deleteCategory(...) → remove or comment out
}
