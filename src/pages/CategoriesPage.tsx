import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "../lib/api";
import { Plus, X } from "lucide-react";
import CategoryAvatar from "../components/CategoryAvatar";
import CategoryEditorSheet, { type CategoryDraft } from "../components/CategoryEditorSheet";
import type { Category } from "../types";

interface CategoriesPageProps {
  categories: Category[];
  onCategoriesChanged: () => void;
}

export default function CategoriesPage({ categories, onCategoriesChanged }: CategoriesPageProps) {
  const [status, setStatus] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const handleCreate = async (draft: CategoryDraft) => {
    if (categories.some((c) => c.name.toLowerCase() === draft.name.toLowerCase())) {
      setStatus(`"${draft.name}" already exists.`);
      return;
    }
    try {
      await createCategory(draft.name, draft.color, draft.icon);
      setStatus("");
      onCategoriesChanged();
    } catch {
      setStatus("Failed to add.");
    }
  };

  const handleUpdate = async (id: string, draft: CategoryDraft) => {
    try {
      await updateCategory(id, draft);
      setStatus("");
      onCategoriesChanged();
    } catch {
      setStatus("Failed to update.");
    }
  };

  const handleDelete = async (id: string, isDefault: boolean) => {
    if (isDefault) { setStatus("Cannot delete default categories."); return; }
    try {
      await deleteCategory(id);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to delete.");
    }
  };

  return (
    <div className="px-6 pt-4 pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <button
          onClick={() => setShowAdd(true)}
          className="w-9 h-9 flex items-center justify-center bg-[#4169e1] text-white rounded-xl"
          aria-label="Add category"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="space-y-2">
        {categories.map((c) => (
          <div
            key={c.id}
            onClick={() => setEditing(c)}
            className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-2xl cursor-pointer active:bg-gray-100 transition-colors"
          >
            <CategoryAvatar category={c} size={40} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-[15px] truncate">{c.name}</div>
              <div className="text-xs text-gray-400">{c.is_default ? "Default" : "Custom"}</div>
            </div>
            {!c.is_default && (
              <button
                onClick={(e) => { e.stopPropagation(); void handleDelete(c.id, c.is_default); }}
                className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                aria-label="Delete category"
              >
                <X size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-center text-red-500">{status}</p>}

      <CategoryEditorSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="New Category"
        submitLabel="Create"
        onSubmit={handleCreate}
      />

      <CategoryEditorSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        initial={editing ? { name: editing.name, color: editing.color, icon: editing.icon } : undefined}
        title="Edit Category"
        submitLabel="Save"
        onSubmit={(draft) => editing ? handleUpdate(editing.id, draft) : Promise.resolve()}
      />
    </div>
  );
}
