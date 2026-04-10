import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "../lib/api";
import { pickCategoryColor } from "../lib/categories";
import type { Category } from "../types";

interface CategoriesPageProps {
  categories: Category[];
  onCategoriesChanged: () => void;
}

export default function CategoriesPage({ categories, onCategoriesChanged }: CategoriesPageProps) {
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;

    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      setStatus(`"${name}" already exists.`);
      return;
    }

    try {
      await createCategory(name, pickCategoryColor(name));
      setNewName("");
      setStatus(`Added: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to add category.");
    }
  };

  const handleDelete = async (id: string, name: string, isDefault: boolean) => {
    if (isDefault) {
      setStatus("Cannot delete default categories.");
      return;
    }

    try {
      await deleteCategory(id);
      setStatus(`Deleted: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to delete category.");
    }
  };

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;

    try {
      await updateCategory(id, { name });
      setEditingId(null);
      setStatus(`Renamed to: ${name}`);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to rename.");
    }
  };

  return (
    <section className="panel panel-full">
      <div className="panel-heading">
        <h2>Categories</h2>
        <span className="tag">{categories.length} total</span>
      </div>

      <div className="category-grid">
        {categories.map((c) => (
          <div key={c.id} className="category-chip-wrap">
            {editingId === c.id ? (
              <form
                className="category-edit-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleRename(c.id);
                }}
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                />
                <button type="submit">Save</button>
                <button type="button" onClick={() => setEditingId(null)}>X</button>
              </form>
            ) : (
              <span
                className="category-chip"
                style={{ backgroundColor: c.color }}
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
              >
                {c.name}
                {!c.is_default && (
                  <button
                    className="chip-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(c.id, c.name, c.is_default);
                    }}
                  >
                    x
                  </button>
                )}
              </span>
            )}
          </div>
        ))}
      </div>

      <form className="category-form" onSubmit={(e) => void handleAdd(e)}>
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add custom category"
        />
        <button className="button button-secondary" type="submit">Add</button>
      </form>

      {status && <p className="status-line">{status}</p>}
    </section>
  );
}
