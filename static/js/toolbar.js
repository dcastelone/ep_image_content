'use strict';

// Removed _handleNewLines as we insert inline now
/*
const _handleNewLines = (ace) => {
  const rep = ace.ace_getRep();
  const lineNumber = rep.selStart[0];
  const curLine = rep.lines.atIndex(lineNumber);
  if (curLine.text) {
    ace.ace_doReturnKey();
    return lineNumber + 1;
  }
  return lineNumber;
};
*/

const _isValid = (file) => {
  const mimedb = clientVars.ep_image_insert.mimeTypes;
  const mimeType = mimedb[file.type];
  let validMime = null;
  const errorTitle = html10n.get('ep_image_insert.error.title');

  if (clientVars.ep_image_insert && clientVars.ep_image_insert.fileTypes) {
    validMime = false;
    if (mimeType && mimeType.extensions) {
      for (const fileType of clientVars.ep_image_insert.fileTypes) {
        const exists = mimeType.extensions.indexOf(fileType);
        if (exists > -1) {
          validMime = true;
          break; // Found a valid type
        }
      }
    }
    if (validMime === false) {
      const errorMessage = html10n.get('ep_image_insert.error.fileType');
      $.gritter.add({ title: errorTitle, text: errorMessage, sticky: true, class_name: 'error' });
      return false;
    }
  }

  if (clientVars.ep_image_insert && file.size > clientVars.ep_image_insert.maxFileSize) {
    const allowedSize = (clientVars.ep_image_insert.maxFileSize / 1000000);
    const errorText = html10n.get('ep_image_insert.error.fileSize', { maxallowed: allowedSize });
    $.gritter.add({ title: errorTitle, text: errorText, sticky: true, class_name: 'error' });
    return false;
  }
  return true;
};

// Helper function to insert the image attribute with ZWSP boundaries
const insertInlineImage = (ace, imageData) => {
  const ZWSP = '\u200b';       // Zero-Width Space
  const placeholder = '\u00a0'; // Use NBSP as placeholder
  const textToInsert = ZWSP + placeholder + ZWSP;

  const escapedSrc = escape(imageData.src);
  const attrKey = 'image'; // Standard attribute key
  const attrValue = escapedSrc; // Escaped src is the value

  // Get current selection to replace it (or insert if no selection)
  const rep = ace.ace_getRep();
  const start = rep.selStart;
  const end = rep.selEnd;

  // Add the placeholder characters, replacing selection if any
  ace.ace_replaceRange(start, end, textToInsert);

  // Define the range for the attribute: ONLY the middle character (the placeholder NBSP)
  const attrStart = [start[0], start[1] + ZWSP.length]; // Start after the first ZWSP
  const attrEnd = [start[0], start[1] + ZWSP.length + placeholder.length]; // End after the placeholder NBSP

  // Apply the image attribute to the placeholder character
  ace.ace_performDocumentApplyAttributesToRange(attrStart, attrEnd, [[attrKey, attrValue]]);

  // Move cursor after all inserted characters
  const finalEnd = [start[0], start[1] + textToInsert.length];
  ace.ace_performSelectionChange(finalEnd, finalEnd, false);
  ace.ace_focus();
};


exports.postToolbarInit = (hook, context) => {
  const toolbar = context.toolbar;
  toolbar.registerCommand('imageUpload', () => {
    $(document).find('body').find('#imageInput').remove();
    const fileInputHtml = `<input
    style="width:1px;height:1px;z-index:-10000;"
    id="imageInput" type="file" />`;
    $(document).find('body').append(fileInputHtml);

    $(document).find('body').find('#imageInput').on('change', (e) => {
      const files = e.target.files;
      if (!files.length) {
        // No specific user message needed here, browser handles it or no file selected is not an error
        return;
      }
      const file = files[0];

      if (!_isValid(file)) {
        return; // Validation errors are handled by _isValid
      }

      if (clientVars.ep_image_insert.storageType === 'base64') {
        $('#imageUploadModalLoader').removeClass('popup-show'); // Ensure loader is hidden initially
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          const data = reader.result;
          const img = new Image();
          img.onload = () => {
            const widthPx = `${img.naturalWidth}px`;
            const heightPx = `${img.naturalHeight}px`;
            context.ace.callWithAce((ace) => {
              ace.ace_doInsertImage(data, widthPx, heightPx);
            }, 'imgBase64', true);
          };
          img.onerror = () => {
             console.error('[ep_image_insert toolbar] Failed to load Base64 image data to get dimensions. Inserting without dimensions.');
             context.ace.callWithAce((ace) => {
               ace.ace_doInsertImage(data);
            }, 'imgBase64Error', true);
          };
          img.src = data;
        };
        reader.onerror = (error_evt) => { // Added error handling for FileReader
            console.error('[ep_image_insert toolbar] FileReader error:', error_evt);
            const errorTitle = html10n.get('ep_image_insert.error.title');
            const errorMessage = html10n.get('ep_image_insert.error.fileRead'); // Generic file read error
            $.gritter.add({ title: errorTitle, text: errorMessage, sticky: true, class_name: 'error' });
        };
      } else { // Upload storage type
        const formData = new FormData();
        formData.append('file', file, file.name);
        $('#imageUploadModalLoader').addClass('popup-show');
        $.ajax({
          type: 'POST',
          url: `${clientVars.padId}/pluginfw/ep_image_insert/upload`,
          xhr: () => $.ajaxSettings.xhr(), // Simplified XHR
          success: (data) => {
            $('#imageUploadModalLoader').removeClass('popup-show');
            const img = new Image();
            img.onload = () => {
              const widthPx = `${img.naturalWidth}px`;
              const heightPx = `${img.naturalHeight}px`;
              context.ace.callWithAce((ace) => {
                ace.ace_doInsertImage(data, widthPx, heightPx);
              }, 'imgUpload', true);
            };
            img.onerror = () => {
               console.error(`[ep_image_insert toolbar] Failed to load uploaded image URL (${data}) to get dimensions. Inserting without dimensions.`);
               context.ace.callWithAce((ace) => {
                 ace.ace_doInsertImage(data);
              }, 'imgUploadError', true);
            };
            img.src = data;
          },
          error: (error) => {
            $('#imageUploadModalLoader').removeClass('popup-show'); // Ensure loader hidden on error
            let errorResponse;
            try {
              errorResponse = JSON.parse(error.responseText.trim());
              if (errorResponse.type) {
                errorResponse.message = `ep_image_insert.error.${errorResponse.type}`;
              }
            } catch (err) {
              errorResponse = { message: error.responseText }; // Fallback to raw error
            }
            const errorTitle = html10n.get('ep_image_insert.error.title');
            const errorText = html10n.get(errorResponse.message, {}, errorResponse.message); // Provide fallback for html10n
            $.gritter.add({ title: errorTitle, text: errorText, sticky: true, class_name: 'error' });
          },
          async: true,
          data: formData,
          cache: false,
          contentType: false,
          processData: false,
          timeout: 60000,
        });
      }
    });
    $(document).find('body').find('#imageInput').trigger('click');
  });
};
