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
     * Updates the HTML preview box at the bottom.
     */
    function updateHtmlPreview() {
        // Use innerHTML for description to get its content
        const descHtml = descriptionEl.innerHTML;

        // Simple formatting to make it readable
        const formattedDesc = descHtml
            .replace(/<(p|h1|h2|ul|ol|li|blockquote)/gi, '\n  <$1') // Add newline and indent
            //.replace(/<\/(p|h1|h2|ul|ol|li|blockquote)>/gi, '\n</$1>'); // Add newline

        htmlPreviewEl.textContent = formattedDesc;
    }

    /**
     * Finds the cursor's current block element and scrolls the preview to it.
     */
    function syncPreviewScroll() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        let node = selection.anchorNode;
        
        // Handle cursor in title
        if (titleEl.contains(node)) {
             htmlPreviewEl.scrollTop = 0; // Scroll to top
             return;
        }

        // Handle cursor in description
        if (!node || !descriptionEl.contains(node)) return; 

        // Find the block-level parent element (e.g., <p>, <h2>)
        let el = (node.nodeType === 3 ? node.parentNode : node);
        while (el && el.parentNode !== descriptionEl) {
            el = el.parentNode;
            if (el === descriptionEl) break; // Stop if we reach the editor itself
        }

        // Default to the first child if something goes wrong
        if (!el || el === descriptionEl) {
            el = descriptionEl.firstChild; 
        }
        if (!el) return; // Editor is empty

        // Find this element's HTML in the preview
        const targetHtml = (el.nodeType === 1) ? el.outerHTML : el.textContent;
        const fullPreviewText = htmlPreviewEl.textContent;
        // Search *after* the title
        const titleHtml = titleEl.outerHTML;
        const searchStartIndex = fullPreviewText.indexOf(titleHtml) + titleHtml.length;
        const index = fullPreviewText.indexOf(targetHtml, searchStartIndex);
        console.log(index, targetHtml)
        if (index === -1) return; // Not found

        // Calculate scroll position
        const preText = fullPreviewText.substring(0, index);
        const lineCount = preText.split('\n').length;
        
        // Get the computed line height of the <pre> tag
        const style = window.getComputedStyle(htmlPreviewEl);
        let lineHeight = parseFloat(style.lineHeight); // Try to parse it
        let fontSize;

        if (isNaN(lineHeight)) {
            // It was "normal". Get the font-size (which IS in pixels)
            // and use a standard multiplier. 1.2 is a safe default.
            fontSize = parseFloat(style.fontSize);
            lineHeight = fontSize * 1.2;
        }
        console.log("lineHeight", lineHeight, "lineCount", lineCount, "fontSize", fontSize)
        // Scroll the preview box
        htmlPreviewEl.scrollTop = lineCount * lineHeight; // ( -1 for 0-index, -1 to show line above)
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
        // Placeholder: Add your complex guessing logic here
        if (text.startsWith('http')) {
            return text;
        }
        if (text.includes('.') && !text.includes(' ')) {
            return 'https://' + text;
        }
        // Default suggestion
        return 'https://';
    }

    /**
     * Validates the URL in the input.
     * Sets the `isUrlValid` state variable.
     */
    function validateUrl() {
        const url = urlInput.value.trim();
        
        // Placeholder: Add your validation logic here
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
            // This will catch empty URLs
            return; 
        }

        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const isImage = imageExtensions.some(ext => url.toLowerCase().endsWith(ext));

        // Restore the selection *before* executing the command
        restoreSelection();

        if (isImage) {
            const altText = savedRange ? savedRange.toString() : '';
            const imgHtml = `<img src="${url}" alt="${altText}">`;
            document.execCommand('insertHTML', false, imgHtml);
        } else {
            document.execCommand('createLink', false, url);
        }

        hideLinkModal();
        updateHtmlPreview(); // Update preview after change
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
            e.preventDefault(); // Stop default "Enter" behavior
            if (isUrlValid) {
                // This prevents closing the modal on Enter when the URL is empty.
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
            updateHtmlPreview();
            // Sync scroll after command
            setTimeout(syncPreviewScroll, 100);
        });
    });

    // Keybinding listener for Ctrl+L
    descriptionEl.addEventListener('keydown', function(e) {
        if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault(); 
            showLinkModal();
        }
    });

    // Update preview on any input in title or description
    titleEl.addEventListener('input', updateHtmlPreview);
    descriptionEl.addEventListener('input', updateHtmlPreview);

    // Sync scroll on cursor move
    titleEl.addEventListener('keyup', syncPreviewScroll);
    titleEl.addEventListener('mouseup', syncPreviewScroll);
    descriptionEl.addEventListener('keyup', syncPreviewScroll);
    descriptionEl.addEventListener('mouseup', syncPreviewScroll);

    // Initial load
    updateHtmlPreview();

});