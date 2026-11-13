// Small helpers for building and updating the page without ever writing raw HTML.

/**
 * Build an element. Text always goes in as text, so user input can never run as markup.
 * @param {string} tag
 * @param {Record<string, unknown>} [props] "class", "text" and "dataset" are special; the rest are properties or attributes
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) return;
    if (key === 'class') node.className = String(value);
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, String(value));
  });
  node.append(...children);
  return node;
}

/**
 * @param {string} id
 * @returns {HTMLElement} the element; throws when the page does not have it
 */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`The page is missing #${id}`);
  return node;
}

/**
 * @param {Node} node
 * @param {string} text
 */
export function setText(node, text) {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Set a field's value, but never while the user is typing in it.
 * @param {HTMLInputElement | HTMLSelectElement} control
 * @param {string} value
 */
export function setValue(control, value) {
  if (document.activeElement !== control && control.value !== value) control.value = value;
}
