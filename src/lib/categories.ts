const customColorPalette = ["#f15b5d", "#ef8a2f", "#00a9a5", "#1882d9", "#43a047", "#d45ab4"];

export function pickCategoryColor(name: string): string {
  const asciiSum = [...name.toLowerCase()].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return customColorPalette[asciiSum % customColorPalette.length];
}
