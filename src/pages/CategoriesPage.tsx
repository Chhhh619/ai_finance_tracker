import { useState } from "react";
import { createCategory, deleteCategory, updateCategory } from "../lib/api";
import { pickCategoryColor } from "../lib/categories";
import { Plus, X, Check } from "lucide-react";
import type { Category } from "../types";

interface CategoriesPageProps {
  categories: Category[];
  onCategoriesChanged: () => void;
}

export default function CategoriesPage({ categories, onCategoriesChanged }: CategoriesPageProps) {
  const [newName, setNewName] = useState("");
  const [showAdd, setShowAdd] = useState(false);
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
      setShowAdd(false);
      setStatus("");
      onCategoriesChanged();
    } catch {
      setStatus("Failed to add.");
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

  const handleRename = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    try {
      await updateCategory(id, { name });
      setEditingId(null);
      onCategoriesChanged();
    } catch {
      setStatus("Failed to rename.");
    }
  };

  return (
    <div className="px-6 pt-4 pb-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Categories</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="w-9 h-9 flex items-center justify-center bg-[#4169e1] text-white rounded-xl"
        >
          <Plus size={18} />
        </button>
      </div>

      {showAdd && (
        <form onSubmit={(e) => void handleAdd(e)} className="flex gap-2 mb-5">
          <input
            type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
            className="flex-1 h-11 px-4 bg-gray-50 rounded-xl text-[15px] outline-none focus:ring-2 focus:ring-[#4169e1]/20"
            placeholder="New category name" autoFocus
          />
          <button type="submit" className="h-11 px-5 bg-[#4169e1] text-white rounded-xl text-sm font-medium">
            Add
          </button>
        </form>
      )}

      <div className="space-y-2">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-2xl">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
              style={{ backgroundColor: c.color }}
            >
              {c.name[0]}
            </div>
            {editingId === c.id ? (
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
                  className="flex-1 h-9 px-3 bg-white rounded-lg text-sm outline-none" autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void handleRename(c.id); }}
                />
                <button onClick={() => void handleRename(c.id)} className="p-1.5 text-emerald-600"><Check size={18} /></button>
                <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400"><X size={18} /></button>
              </div>
            ) : (
              <div
                className="flex-1 flex items-center justify-between cursor-pointer"
                onClick={() => { setEditingId(c.id); setEditName(c.name); }}
              >
                <div>
                  <div className="font-medium text-[15px]">{c.name}</div>
                  <div className="text-xs text-gray-400">{c.is_default ? "Default" : "Custom"}</div>
                </div>
                {!c.is_default && (
                  <button
                    onClick={(e) => { e.stopPropagation(); void handleDelete(c.id, c.is_default); }}
                    className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {status && <p className="mt-4 text-sm text-center text-red-500">{status}</p>}
    </div>
  );
}
