document.addEventListener('DOMContentLoaded', function() {

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
        // Save the user's selection *before* showing the modal
        savedRange = saveSelection();
        const selectedText = savedRange ? savedRange.toString() : '';

        // Pre-fill the input with a guess
        urlInput.value = guessUrlFromText(selectedText);
        
        // Show the modal
        modalBackdrop.style.display = 'block';
        modal.style.display = 'block';

        // Run validation once immediately on open
        validateUrl(); 

        urlInput.focus();
    }

    /**
     * Hides the link/image modal and cleans up
     */
    function hideLinkModal() {
        modalBackdrop.style.display = 'none';
        modal.style.display = 'none';

        // Stop any pending validation timer
        if (validationTimer) clearTimeout(validationTimer);

        // Clear modal state
        urlInput.value = '';
        validationMsg.textContent = '';
        savedRange = null; // Clear the saved selection
        isUrlValid = false; // Reset validation state
    }

    /**
     * Handles the "OK" button click
     */
    function onLinkModalOk() {
        const url = urlInput.value.trim();
        
        // Run validation one last time
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
            // Get the selected text to use as alt text
            const altText = savedRange ? savedRange.toString() : '';
            // We use insertHTML to create an img tag with an alt attribute
            const imgHtml = `<img src="${url}" alt="${altText}">`;
            document.execCommand('insertHTML', false, imgHtml);
        } else {
            // This is a standard link
            document.execCommand('createLink', false, url);
        }

        hideLinkModal();
    }

    // --- Event Listeners ---

    // Modal button listeners
    okBtn.addEventListener('click', onLinkModalOk);
    cancelBtn.addEventListener('click', hideLinkModal);
    modalBackdrop.addEventListener('click', hideLinkModal);

    // Debounced validation on URL input
    urlInput.addEventListener('input', () => {
        // Clear any existing timer
        if (validationTimer) clearTimeout(validationTimer);
        // Set a new timer to run validateUrl after 500ms
        validationTimer = setTimeout(validateUrl, 500);
    });

    // "Enter" key listener for the URL input
    urlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // Stop default "Enter" behavior
            if (isUrlValid) {
                // If the URL is OK, submit it
                onLinkModalOk();
            }
            // If not (isUrlValid === false), do nothing.
            // This prevents closing the modal on Enter when the URL is empty.
        }
    });


    // WYSIWYG toolbar
    const toolbarButtons = document.querySelectorAll('.toolbar a');
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault(); // Stop the link from navigating
            const command = this.dataset.command;
    
            if (command === 'h1' || command === 'h2' || command === 'p') {
                document.execCommand('formatBlock', false, command);
            }
            // Intercept link/image commands to use our modal
            else if (command === 'createlink' || command === 'insertimage') {
                showLinkModal();
            }
            // All other commands
            else {
                document.execCommand(command, false, null);
            }
    
        });
    });

    // Keybinding listener for Ctrl+L
    const editors = document.querySelectorAll('.editor');
    editors.forEach(editor => {
        editor.addEventListener('keydown', function(e) {
            // Check for Ctrl+L (or Cmd+L on Mac)
            if (e.key === 'l' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault(); // Prevent browser's default "Go to URL" action
                showLinkModal();
            }
        });
    });

});