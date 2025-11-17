document.addEventListener('DOMContentLoaded', function() {

    // --- Editor & Preview Elements ---
    const titleEl = document.getElementById('title');
    const descriptionEl = document.getElementById('description');
    const htmlPreviewEl = document.getElementById('html-preview');

    // --- Modal Elements ---
    const modalBackdrop = document.getElementById('modal-backdrop');
    const modal = document.getElementById('link-modal');
    const urlInput = document.getElementById('modal-url-input');
    const okBtn = document.getElementById('modal-ok-btn');
    const cancelBtn = document.getElementById('modal-cancel-btn');
    const validationMsg = document.getElementById('modal-validation-msg');

    let validationTimer = null; // For debouncing
    let savedRange = null; // To store the user's text selection
    let isUrlValid = false; // State for Enter key logic

    // --- Helper Functions ---

    /**
     * A simple "pretty print" function for the HTML source
     * @param {string} html - The HTML string
     * @returns {string} - The formatted string
     */
    function prettyPrintHtml(html) {
        // We only add newlines before block elements
        return html.replace(/<(p|br|h1|h2|ul|ol|li|blockquote)/gi, '\n  <$1');
    }

    /**
     * NEW: Replaces updateHtmlPreview and syncPreviewScroll.
     * Implements the "insert marker" strategy using text nodes.
     */
    function updateAndSyncPreview() {
        let html = descriptionEl.innerHTML;
        const selection = window.getSelection();
        let beforeHtml = '';
        let afterHtml = '';

        // Step 1: Find the cursor position by inserting a temporary marker in the editor
        if (selection.rangeCount > 0 && descriptionEl.contains(selection.anchorNode)) {
            const range = selection.getRangeAt(0);
            const rangeBackup = range.cloneRange();
            
            // Create a temporary marker to find the split point
            const tempMarker = document.createElement('span');
            tempMarker.id = 'cursor-marker-temp';
            
            try {
                range.insertNode(tempMarker);
                // Get the editor's HTML, *with* the marker in it
                html = descriptionEl.innerHTML; 
                // Clean the marker out of the *editor*
                tempMarker.parentNode.removeChild(tempMarker); 
            } catch (e) {
                console.error("Error inserting preview marker:", e);
                html = descriptionEl.innerHTML; // Fallback
            }
            
            // Restore the user's selection in the editor
            selection.removeAllRanges();
            selection.addRange(rangeBackup);

            // Now split the HTML string at the marker
            const markerHtml = tempMarker.outerHTML;
            const parts = html.split(markerHtml);
            beforeHtml = parts[0];
            afterHtml = parts[1] || '';

        } else {
            // No valid selection, just show all HTML as "before"
            beforeHtml = html;
            afterHtml = '';
        }

        // --- This is the new logic ---
        
        // Step 1: Clear the preview
        htmlPreviewEl.innerHTML = '';

        // Step 2: Create and append the "before" text as a text node
        const beforeNode = document.createTextNode(prettyPrintHtml(beforeHtml));
        htmlPreviewEl.appendChild(beforeNode);

        // Step 3: Create and append the real, visible marker as an element
        const markerNode = document.createElement('span');
        markerNode.id = 'cursor-marker'; // The real ID for styling/scrolling
        htmlPreviewEl.appendChild(markerNode);

        // Step 4: Create and append the "after" text as a text node
        const afterNode = document.createTextNode(prettyPrintHtml(afterHtml));
        htmlPreviewEl.appendChild(afterNode);
        // --- End new logic ---

        // Step 5: Scroll the real marker into view
        markerNode.scrollIntoView({ 
            behavior: 'auto', 
            block: 'nearest' 
        });
    }


    /**
     * Saves the current user selection (Range object)
     * @returns {Range|null}
     */
    function saveSelection() {
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            return selection.getRangeAt(0);
        }
        return null;
    }

    /**
     * Restores a previously saved selection
     */
    function restoreSelection() {
        if (savedRange) {
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(savedRange);
        }
    }

    /**
     * Placeholder function to "guess" a URL from selected text
     * @param {string} text - The user's selected text
     * @returns {string} - A guessed URL
     */
    function guessUrlFromText(text) {
        if (text.startsWith('http')) {
            return text;
        }
        if (text.includes('.') && !text.includes(' ')) {
            return 'https://' + text;
        }
        return 'https://';
    }

    /**
     * Validates the URL in the input.
     * Sets the `isUrlValid` state variable.
     */
    function validateUrl() {
        const url = urlInput.value.trim();
        
        if (url.length === 0) {
            validationMsg.textContent = 'Please enter a URL.';
            validationMsg.style.color = 'red';
            isUrlValid = false; // URL is NOT ok
        } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
            validationMsg.textContent = 'Warning: URL should typically start with http:// or https://';
            validationMsg.style.color = 'orange';
            isUrlValid = true; // URL is "ok" (submittable)
        } else {
            validationMsg.textContent = 'URL looks valid.';
            validationMsg.style.color = 'green';
            isUrlValid = true; // URL is "ok"
        }
    }

    /**
     * Shows the link/image modal
     */
    function showLinkModal() {
        savedRange = saveSelection();
        const selectedText = savedRange ? savedRange.toString() : '';
        urlInput.value = guessUrlFromText(selectedText);
        
        modalBackdrop.style.display = 'block';
        modal.style.display = 'block';

        validateUrl(); 
        urlInput.focus();
    }

    /**
     * Hides the link/image modal and cleans up
     */
    function hideLinkModal() {
        modalBackdrop.style.display = 'none';
        modal.style.display = 'none';

        if (validationTimer) clearTimeout(validationTimer);
        urlInput.value = '';
        validationMsg.textContent = '';
        savedRange = null; 
        isUrlValid = false; 
    }

    /**
     * Handles the "OK" button click
     */
    function onLinkModalOk() {
        const url = urlInput.value.trim();
        
        validateUrl();
        if (!isUrlValid) {
            return; 
        }

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const isImage = imageExtensions.some(ext => url.toLowerCase().endsWith(ext));

        restoreSelection();

        if (isImage) {
            const altText = savedRange ? savedRange.toString() : '';
            const imgHtml = `<img src="${url}" alt="${altText}">`;
            document.execCommand('insertHTML', false, imgHtml);
        } else {
            document.execCommand('createLink', false, url);
        }

        hideLinkModal();
        updateAndSyncPreview(); // Update preview after change
    }

    // --- Event Listeners ---

    // Modal button listeners
    okBtn.addEventListener('click', onLinkModalOk);
    cancelBtn.addEventListener('click', hideLinkModal);
    modalBackdrop.addEventListener('click', hideLinkModal);

    // Debounced validation on URL input
    urlInput.addEventListener('input', () => {
        if (validationTimer) clearTimeout(validationTimer);
        validationTimer = setTimeout(validateUrl, 500);
    });

    // "Enter" key listener for the URL input
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            if (isUrlValid) {
                onLinkModalOk();
            }
        }
    });


    // WYSIWYG toolbar
    const toolbarButtons = document.querySelectorAll('.toolbar a');
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); 
            const command = this.dataset.command;
    
            if (command === 'h1' || command === 'h2' || command === 'p') {
                document.execCommand('formatBlock', false, command);
            }
            else if (command === 'createlink' || command === 'insertimage') {
                showLinkModal();
            }
            else {
                document.execCommand(command, false, null);
            }
            // Update preview after any command
            // Use setTimeout to allow the DOM to update from execCommand
            setTimeout(updateAndSyncPreview, 100);
        });
    });

    // Keybinding listener for Ctrl+L (only on description)
    descriptionEl.addEventListener('keydown', function(e) {
        if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); 
            showLinkModal();
        }
    });
    // Add to title as well
    titleEl.addEventListener('keydown', function(e) {
        if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); 
            showLinkModal();
        }
    });


    // --- HTML Preview & Sync Listeners ---

    // Update preview ONLY when description changes
    descriptionEl.addEventListener('input', updateAndSyncPreview);

    // Sync scroll on cursor move
    let changetime;
    descriptionEl.addEventListener('keyup', () => {
        clearTimeout(changetime);
        changetime = setTimeout(updateAndSyncPreview, 500);
    });
    descriptionEl.addEventListener('mouseup', () => {
        clearTimeout(changetime);
        changetime = setTimeout(updateAndSyncPreview, 100);
    });
    // Also sync on focus
    descriptionEl.addEventListener('focus', updateAndSyncPreview);

    // Initial load
    updateAndSyncPreview();

});