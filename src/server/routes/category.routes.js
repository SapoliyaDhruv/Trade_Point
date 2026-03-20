const express = require('express');
const router = express.Router();

const {
  addCategory,
  getCategories,
  updateCategory,
  deleteCategory
} = require('../controllers/category.controller');
const { verifyToken, isAdmin } = require('../middleware/auth.middleware');

router.post('/', verifyToken, isAdmin, addCategory);
router.get('/', verifyToken,getCategories);
router.put('/:id', verifyToken, isAdmin, updateCategory);
router.delete('/:id', verifyToken, isAdmin, deleteCategory);

module.exports = router;
