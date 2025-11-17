document.addEventListener('DOMContentLoaded', function() {

    // WYSIWYG toolbar
    const toolbarButtons = document.querySelectorAll('.toolbar a');

    // Loop through all buttons and add a click event listener
    toolbarButtons.forEach(button => {
        button.addEventListener('click', function(e) {
            
            // Prevent the link's default behavior
            e.preventDefault(); 
            
            // Get the command from the data-command attribute
            const command = this.dataset.command;
    
            if (command == 'h1' || command == 'h2' || command == 'p') {
                document.execCommand('formatBlock', false, command);
            }
            
            else if (command == 'createlink' || command == 'insertimage') {
                let url = prompt('Enter the link here: ','http:\/\/');
                document.execCommand(command, false, url);
            }
            
            else {
                document.execCommand(command, false, null);
            }
    
        });
    });

    // Auto-save functionality has been removed as requested.

});
