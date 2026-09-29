/**
 * Handing an SVG to the user: to the disk as a file, to the clipboard as text.
 *
 * @remarks
 * Every page that draws a picture of its own needs the same two ways to get it
 * out, and the same line to report it on, so they live here once. The pages keep
 * their own markup: this module only takes the name, the markup and the status
 * line, and never looks anything up itself.
 */

/**
 * Downloads markup as an SVG file.
 *
 * @param name - The file name to offer, with the `.svg` ending.
 * @param markup - The picture as SVG markup.
 */
export function downloadSvg(name: string, markup: string): void {
  const blob = new Blob([markup], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Puts markup on the clipboard.
 *
 * @remarks
 * The async Clipboard API first, the legacy execCommand path second, because a
 * page served over plain http has no permission to use the first one.
 *
 * @param markup - The text to copy.
 * @returns Whether the text made it to the clipboard.
 */
export async function copySvg(markup: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(markup);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = markup;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    area.remove();
    return copied;
  }
}

/**
 * Shows a message on the status line of a file button.
 *
 * @param status - The line to write on, or null when the page has none.
 * @param message - What to report.
 */
export function setFileStatus(status: HTMLElement | null, message: string): void {
  if (!status) return;
  status.textContent = message;
  status.hidden = false;
}
