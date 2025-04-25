'use strict';

// Removed the old 'image' helper object that worked with line attributes
/*
const image = {
  setImageSize(width, lineNumber) {
    const documentAttributeManager = this.documentAttributeManager;
    // Simply set the width attribute. Remove previous workarounds.
    console.log(`[ep_image_insert setImageSize] Setting imgWidth=${width} for line ${lineNumber}`);
    documentAttributeManager.setAttributeOnLine(lineNumber, 'imgWidth', width);
  },

  setImageAlign(position, lineNumber) {
    const documentAttributeManager = this.documentAttributeManager;
    documentAttributeManager.setAttributeOnLine(lineNumber, 'imgAlign', position);
  },

  removeImage(lineNumber) {
    const documentAttributeManager = this.documentAttributeManager;
    console.log(`[ep_image_insert removeImage] Removing attributes for line ${lineNumber}`);
    documentAttributeManager.removeAttributeOnLine(lineNumber, 'img');
    documentAttributeManager.removeAttributeOnLine(lineNumber, 'imgWidth');
    documentAttributeManager.removeAttributeOnLine(lineNumber, 'imgAlign');
  },

  addImage(lineNumber, src, optionalWidth) {
    const documentAttributeManager = this.documentAttributeManager;
    console.log(`[ep_image_insert addImage] Setting img=${src} for line ${lineNumber}`);
    documentAttributeManager.setAttributeOnLine(lineNumber, 'img', src);
    // If width is provided, set it in the same operation
    if (optionalWidth !== undefined && optionalWidth !== null) {
       console.log(`[ep_image_insert addImage] Also setting imgWidth=${optionalWidth} for line ${lineNumber}`);
       documentAttributeManager.setAttributeOnLine(lineNumber, 'imgWidth', optionalWidth);
    }
  }
};
*/

exports.aceAttribsToClasses = function(name, context) {
  // console.log('[ep_image_insert aceAttribsToClasses]', context); // DEBUG
  if (context.key === 'image' && context.value) {
    console.log(`[ep_image_insert aceAttribsToClasses] Found image attribute, length: ${context.value.length}`); // Don't log full base64
    return ['image:' + context.value];
  }
  // New: Add image-width and image-height attributes
  if (context.key === 'image-width' && context.value) {
    console.log(`[ep_image_insert aceAttribsToClasses] Found image-width: ${context.value}`);
    return ['image-width:' + context.value];
  }
  if (context.key === 'image-height' && context.value) {
    console.log(`[ep_image_insert aceAttribsToClasses] Found image-height: ${context.value}`);
    return ['image-height:' + context.value];
  }
  return [];
};

// Remove the old DOM processing hook that replaced the line content
// exports.aceDomLineProcessLineAttributes = ... (Removed)

exports.aceInitialized = (hook, context) => {
  // Bind the new image insertion function
  context.editorInfo.ace_doInsertImage = doInsertImage.bind(context);
  
  // Remove the old helper functions that relied on line attributes
  /*
  const editorInfo = context.editorInfo;
  editorInfo.ace_addImage = image.addImage.bind(context);
  editorInfo.ace_setImageSize = image.setImageSize.bind(context);
  editorInfo.ace_setImageAlign = image.setImageAlign.bind(context);
  editorInfo.ace_removeImage = image.removeImage.bind(context);
  editorInfo.ace_getAttributeOnLine = ...
  */
};

// Function to render placeholders into actual images
const renderImagePlaceholders = (rootElement) => {
  console.log('[ep_image_insert] Searching for placeholders within:', rootElement);
  const placeholders = $(rootElement).find('span.image-placeholder');
  console.log(`[ep_image_insert] Found ${placeholders.length} placeholders.`);

  placeholders.each(function() {
    const $placeholder = $(this);
    // Check if already processed to prevent infinite loops with MutationObserver
    if ($placeholder.data('processed-image')) {
        return;
    }

    console.log('[ep_image_insert] Processing placeholder:', this);
    const attribsData = $placeholder.data('image-attribs');
    if (typeof attribsData === 'string') {
      try {
        const imageData = JSON.parse(attribsData);
        console.log('[ep_image_insert] Parsed image data:', imageData);

        if (imageData && imageData.src) {
          const $img = $('<img>').attr('src', imageData.src);
          $img.css({
            'display': 'inline-block', // Make it inline
            'max-width': '100%',       // Prevent overflow
            'max-height': '20em',      // Reasonable max height
            'vertical-align': 'middle' // Align nicely with text
          });

          if (imageData.width) $img.attr('width', imageData.width);
          if (imageData.height) $img.attr('height', imageData.height);
        
          // Replace the placeholder content (ZWS) with the image
          $placeholder.empty().append($img);
          // Mark as processed
          $placeholder.data('processed-image', true);
          // Remove the data attribute after processing? Maybe keep for debugging.
          console.log('[ep_image_insert] Replaced placeholder with image:', $img[0]);
        } else {
          console.warn('[ep_image_insert] Invalid image data found in placeholder:', attribsData);
          $placeholder.text('[Invalid Image]'); // Show error inline
          $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
        }
      } catch (e) {
        console.error('[ep_image_insert] Failed to parse image data:', attribsData, e);
        $placeholder.text('[Parse Error]'); // Show error inline
        $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
      }
    } else {
      console.warn('[ep_image_insert] Missing or invalid data-image-attribs:', attribsData);
      $placeholder.text('[Missing Data]'); // Show error inline
      $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
    }
  });
};

// Use MutationObserver to render images when placeholders appear in the DOM
exports.postAceInit = function (hook, context) {
  console.log('[ep_image_insert] postAceInit: Hook running.');

  const padOuter = $('iframe[name="ace_outer"]').contents().find('body');
  if (padOuter.length === 0) {
      console.error('[ep_image_insert postAceInit] Could not find outer pad body.');
      return;
  }

  // --- Create Resize Outline Box (if it doesn't exist) ---
  if ($('#imageResizeOutline').length === 0) {
      const $outlineBox = $('<div id="imageResizeOutline"></div>');
      $outlineBox.css({
          position: 'absolute',
          border: '1px dashed #1a73e8', // Example style, adjust in CSS
          backgroundColor: 'rgba(26, 115, 232, 0.1)',
          'pointer-events': 'none',
          display: 'none',
          'z-index': 1000,
          'box-sizing': 'border-box'
      });
      // Append to OUTER body (like old plugin)
      padOuter.append($outlineBox);
      console.log('[ep_image_insert postAceInit] Added resize outline box to OUTER body.');
  } else {
      console.log('[ep_image_insert postAceInit] Resize outline box already exists.');
  }

  // Initialize outline box reference OUTSIDE callWithAce
  const $outlineBoxRef = padOuter.find('#imageResizeOutline');
  // Store ace context for nested calls
  const _aceContext = context.ace;

  // Check if element exists NOW
  if (!$outlineBoxRef || $outlineBoxRef.length === 0) {
     console.error('[ep_image_insert postAceInit] FATAL: Could not find #imageResizeOutline OUTSIDE callWithAce.');
     // Cannot proceed without the outline box
     return; 
  } else {
     console.log('[ep_image_insert postAceInit] Successfully found #imageResizeOutline OUTSIDE callWithAce.', $outlineBoxRef[0]);
  }

  context.ace.callWithAce((ace) => {
    console.log('[ep_image_insert postAceInit] Inside callWithAce.');

    // Get inner iframe body (similar to old plugin)
    const $innerIframe = $('iframe[name="ace_outer"]').contents().find('iframe[name="ace_inner"]');
    if ($innerIframe.length === 0) {
        console.error('ep_image_insert: ERROR - Could not find inner iframe (ace_inner).');
        return;
    }
    const innerDocBody = $innerIframe.contents().find('body')[0];
    const $inner = $(innerDocBody);
    const innerDoc = $innerIframe.contents(); // Inner document for mousemove/up

    if (!$inner || $inner.length === 0) {
        console.error('ep_image_insert: ERROR - Could not get body from inner iframe.');
        return;
    }

    // Drag state variables
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;
    let startHeight = 0;
    let aspectRatio = 1;
    let targetOuterSpan = null; // Our main placeholder span
    let targetInnerSpan = null; // The span we style with the background
    let targetLineNumber = -1; // Store line number of dragged image
    let outlineBoxPositioned = false; // NEW: Flag to track if outline is positioned
    let mousedownClientX = 0; // NEW: Record viewport X on mousedown
    let mousedownClientY = 0; // NEW: Record viewport Y on mousedown
    let clickedHandle = null; // NEW: Store which handle was clicked ('tl', 'tr', 'bl', 'br')
    // let parentContainerWidth = 0; // Might need recalculation
    // let targetAttrRange = null; // To store the range for attribute update

    // --- Mousedown Listener ---
    $inner.on('mousedown', '.inline-image.image-placeholder', function(evt) {
        if (evt.button !== 0) return; // Only left clicks
        targetOuterSpan = this;
        const $targetOuterSpan = $(targetOuterSpan);

        // Clear selection from other images
        $inner.find('.inline-image.image-placeholder.selected').removeClass('selected');

        // Add selected class to current image
        $targetOuterSpan.addClass('selected');

        // Find the inner span
        targetInnerSpan = targetOuterSpan.querySelector('span.image-inner');
        if (!targetInnerSpan) {
            console.error('[ep_image_insert mousedown] Could not find inner span.');
            targetOuterSpan = null; // Reset if invalid
            return;
        }

        const target = $(evt.target);
        const isResizeHandle = target.hasClass('image-resize-handle');

        if (isResizeHandle) {
            console.log('[ep_image_insert] mousedown on resize handle');
            isDragging = true;
            outlineBoxPositioned = false; // Reset flag on new drag start
            startX = evt.clientX; // Keep relative mouse tracking start point
            mousedownClientX = evt.clientX; // Record viewport X
            mousedownClientY = evt.clientY; // Record viewport Y
            startWidth = targetInnerSpan.offsetWidth || parseInt(targetInnerSpan.style.width, 10) || 0;
            startHeight = targetInnerSpan.offsetHeight || parseInt(targetInnerSpan.style.height, 10) || 0;
            aspectRatio = (startWidth > 0 && startHeight > 0) ? (startHeight / startWidth) : 1;

            // Determine which handle was clicked
            if (target.hasClass('tl')) clickedHandle = 'tl';
            else if (target.hasClass('tr')) clickedHandle = 'tr';
            else if (target.hasClass('bl')) clickedHandle = 'bl';
            else if (target.hasClass('br')) clickedHandle = 'br';
            else clickedHandle = null; // Should not happen if isResizeHandle is true
            
            console.log(`[ep_image_insert mousedown] Initial W/H read: ${startWidth}/${startHeight}. Click Viewport: X=${mousedownClientX}, Y=${mousedownClientY}. Handle: ${clickedHandle}`);

            // Store line number and attempt to calculate column index immediately
            const lineNode = targetOuterSpan ? targetOuterSpan.parentNode : null;
            if (lineNode) {
                let imageIndex = 0;
                let currentSibling = targetOuterSpan.previousElementSibling;
                while (currentSibling) {
                    if (currentSibling.classList.contains('image-placeholder')) {
                        imageIndex++;
                    }
                    currentSibling = currentSibling.previousElementSibling;
                }
                console.log(`[ep_image_insert mousedown] Calculated imageIndex: ${imageIndex}`);
                targetLineNumber = _getLineNumberOfElement(lineNode);
                console.log(`[ep_image_insert mousedown] Stored target line number: ${targetLineNumber}`);
                $(targetOuterSpan).attr('data-line', targetLineNumber);
                _aceContext.callWithAce((ace) => {
                    const rep = ace.ace_getRep();
                    const lineText = rep.lines.atIndex(targetLineNumber).text;
                    const placeholderSequence = '\u200B\u200B\u200B';
                    let colStart = -1;
                    let currentOccurence = 0;
                    let searchFromIndex = 0;
                    while (currentOccurence <= imageIndex) {
                        const foundIndex = lineText.indexOf(placeholderSequence, searchFromIndex);
                        if (foundIndex === -1) {
                            colStart = -1;
                            console.error(`[ep_image_insert mousedown] Failed to find ${imageIndex}-th sequence (found ${currentOccurence}) in line: "${lineText}"`);
                            break;
                        }
                        if (currentOccurence === imageIndex) {
                            colStart = foundIndex;
                            break;
                        }
                        currentOccurence++;
                        searchFromIndex = foundIndex + 1;
                    }
                    if (colStart >= 0) {
                        console.log(`[ep_image_insert mousedown] Found ${imageIndex}-th sequence at column: ${colStart}`);
                        $(targetOuterSpan).attr('data-col', colStart);
                    } else {
                        console.error(`[ep_image_insert mousedown] Could not find ${imageIndex}-th placeholder sequence in line text: "${lineText}"`);
                        $(targetOuterSpan).removeAttr('data-col');
                    }
                }, 'getImageColStart', true);
            } else {
                console.error('[ep_image_insert mousedown] Could not find line node to store line number.');
                targetLineNumber = -1;
            }

            evt.preventDefault(); // Prevent text selection
        }
    });

    // --- Mousemove Listener ---
    innerDoc.on('mousemove', function(evt) {
        if (isDragging) {
            // --- POSITION OUTLINE BOX (Run only ONCE on first mousemove) ---
            if (!outlineBoxPositioned) {
                 if (!targetInnerSpan || !padOuter || !targetOuterSpan || !innerDocBody || !$innerIframe) { // Added more checks
                     console.error('[ep_image_insert mousemove] Cannot position outline: Required elements missing.');
                     return; // Cannot proceed
                 }
                 console.log('[ep_image_insert mousemove] Positioning outline box (first move - old coord calc method)...');
                 
                 // 1. Get Dimensions from mousedown (startWidth/startHeight)
                 const currentWidth = startWidth; 
                 const currentHeight = startHeight;
                 console.log(`[ep_image_insert mousemove] Using Start Dims: W=${currentWidth}, H=${currentHeight}`);

                 if (currentWidth <= 0 || currentHeight <= 0) {
                     console.warn(`[ep_image_insert mousemove] Invalid start dimensions (${currentWidth}x${currentHeight}). Outline box positioning might fail.`);
                 }

                 // 2. Get Container Rects & Scrolls 
                 let innerBodyRect, innerIframeRect, outerBodyRect;
                 let scrollTopInner, scrollLeftInner, scrollTopOuter, scrollLeftOuter;
                 try {
                     innerBodyRect = innerDocBody.getBoundingClientRect();
                     innerIframeRect = $innerIframe[0].getBoundingClientRect();
                     outerBodyRect = padOuter[0].getBoundingClientRect();
                     scrollTopInner = innerDocBody.scrollTop;
                     scrollLeftInner = innerDocBody.scrollLeft;
                     scrollTopOuter = padOuter.scrollTop();
                     scrollLeftOuter = padOuter.scrollLeft();
                 } catch (e) {
                     console.error('[ep_image_insert mousemove] Error getting container rects/scrolls:', e);
                     return; 
                 }

                 // 3. Calculate Click Relative to Scrolled Inner Body
                 const clickTopRelInner = mousedownClientY - innerBodyRect.top + scrollTopInner;
                 const clickLeftRelInner = mousedownClientX - innerBodyRect.left + scrollLeftInner;

                 // 4. Calculate Inner Frame Relative to Scrolled Outer Body
                 const innerFrameTopRelOuter = innerIframeRect.top - outerBodyRect.top + scrollTopOuter;
                 const innerFrameLeftRelOuter = innerIframeRect.left - outerBodyRect.left + scrollLeftOuter;

                 // 5. Calculate Base Position of Click Relative to Scrolled Outer Body
                 const baseClickTopOuter = innerFrameTopRelOuter + clickTopRelInner;
                 const baseClickLeftOuter = innerFrameLeftRelOuter + clickLeftRelInner;

                 // 6. Calculate desired Outline Top/Left based on Handle
                 let outlineTop = baseClickTopOuter;
                 let outlineLeft = baseClickLeftOuter;
                 if (clickedHandle === 'tr' || clickedHandle === 'br') {
                    outlineLeft -= currentWidth; // Adjust left if right handle clicked
                 }
                 if (clickedHandle === 'bl' || clickedHandle === 'br') {
                    outlineTop -= currentHeight; // Adjust top if bottom handle clicked
                 }
                 console.log(`[ep_image_insert mousemove] Outline Top/Left calculated for Handle (${clickedHandle}): T=${outlineTop}, L=${outlineLeft}`);

                 // 7. Adjust for Outer Padding (Adding)
                 const outerPadding = window.getComputedStyle(padOuter[0]);
                 const outerPaddingTop = parseFloat(outerPadding.paddingTop) || 0;
                 const outerPaddingLeft = parseFloat(outerPadding.paddingLeft) || 0; 
                 const finalOutlineTop = outlineTop + outerPaddingTop; 
                 const finalOutlineLeft = outlineLeft + outerPaddingLeft; 

                 // 8. Manual Adjustment (REINSTATED with small values)
                 const MANUAL_OFFSET_TOP = 9; // Small adjustment
                 const MANUAL_OFFSET_LEFT = 42; // Small adjustment
                 const finalTopWithManualOffset = finalOutlineTop + MANUAL_OFFSET_TOP; 
                 const finalLeftWithManualOffset = finalOutlineLeft + MANUAL_OFFSET_LEFT;

                 // Use the final calculated values with manual offset
                 console.log(`[ep_image_insert mousemove] Positioning outline box at: L=${finalLeftWithManualOffset}, T=${finalTopWithManualOffset}, W=${currentWidth}, H=${currentHeight}`);
                 $outlineBoxRef.css({
                     left: finalLeftWithManualOffset + 'px', 
                     top: finalTopWithManualOffset + 'px',   
                     width: currentWidth + 'px',
                     height: currentHeight + 'px',
                     display: 'block'
                 });
                 outlineBoxPositioned = true; // Mark as positioned
                 // --- End Positioning Logic ---
            }
            // --- END POSITION OUTLINE BOX ---

            // --- Update Outline Box Size (Runs on every mousemove while dragging) ---
            if ($outlineBoxRef && $outlineBoxRef.length > 0) {
                const currentX = evt.clientX;
                const deltaX = currentX - startX;
                let newPixelWidth = startWidth + deltaX;
                newPixelWidth = Math.max(20, newPixelWidth);
                const newPixelHeight = newPixelWidth * aspectRatio;
                // console.log(`[ep_image_insert mousemove] Updating outline size: W=${newPixelWidth.toFixed(0)}px, H=${newPixelHeight.toFixed(0)}px`); // Reduce log noise
                $outlineBoxRef.css({
                    width: newPixelWidth + 'px',
                    height: newPixelHeight + 'px'
                });
            } else {
                console.error('[ep_image_insert mousemove] Outline box ref missing or invalid during size update!');
            }

            $inner.css('cursor', 'nwse-resize');
        }
    });

    // --- Mouseup Listener ---
    innerDoc.on('mouseup', function(evt) {
        if (isDragging) {
            console.log('[ep_image_insert] resize mouseup');
            const finalX = evt.clientX;
            const deltaX = finalX - startX;
            let finalPixelWidth = startWidth + deltaX;
            finalPixelWidth = Math.max(20, Math.round(finalPixelWidth));
            const widthToApply = `${finalPixelWidth}px`;

            const finalPixelHeight = finalPixelWidth * aspectRatio;
            const heightToApply = `${Math.round(finalPixelHeight)}px`;

            if (targetInnerSpan) {
                console.log(`[ep_image_insert mouseup] Applying style W: ${widthToApply}, H: ${heightToApply} to targetInnerSpan`);
                $(targetInnerSpan).css({
                    'width': widthToApply,
                    'height': heightToApply
                });
            } else {
                console.error('[ep_image_insert mouseup] targetInnerSpan missing, cannot apply style!');
            }

            let targetRange = null;
            if (targetOuterSpan) {
                const lineStr = $(targetOuterSpan).attr('data-line');
                const colStr = $(targetOuterSpan).attr('data-col');
                if (lineStr !== undefined && colStr !== undefined) {
                    const lineNum = parseInt(lineStr, 10);
                    const colStart = parseInt(colStr, 10);
                    if (!isNaN(lineNum) && !isNaN(colStart)) {
                         const rangeStart = [lineNum, colStart + 1];
                         const rangeEnd = [lineNum, colStart + 2];
                         targetRange = [rangeStart, rangeEnd];
                         console.log('[ep_image_insert mouseup] Calculated target range from data attributes:', targetRange);
                    } else {
                         console.error('[ep_image_insert mouseup] Invalid line/col data attributes:', lineStr, colStr);
                    }
                } else {
                     console.error('[ep_image_insert mouseup] Missing line/col data attributes.');
                }
            }

            if (targetRange) {
                 console.log(`[ep_image_insert mouseup] Applying image-width=${widthToApply} AND image-height=${heightToApply} to range:`, targetRange);
                 _aceContext.callWithAce((ace) => {
                     ace.ace_performDocumentApplyAttributesToRange(targetRange[0], targetRange[1], [
                         ['image-width', widthToApply],
                         ['image-height', heightToApply]
                     ]);
                 }, 'applyImageWidthAttribute', true);
            } else {
                 console.error('[ep_image_insert mouseup] Cannot apply attribute: Target range not found.');
            }

            isDragging = false;
            outlineBoxPositioned = false; // Reset flag
            clickedHandle = null; // Reset clicked handle
            $outlineBoxRef.hide();
            $inner.css('cursor', 'auto');
            if (targetOuterSpan) $(targetOuterSpan).removeClass('selected');
            targetOuterSpan = null;
            targetInnerSpan = null;
            targetLineNumber = -1;
            if (targetOuterSpan) {
                $(targetOuterSpan).removeAttr('data-line').removeAttr('data-col');
            }
        }
    });

    // --- Add Paste Listener --- NEW
    $inner.on('paste', function(evt) {
        const clipboardData = evt.originalEvent.clipboardData || window.clipboardData;
        if (!clipboardData) return;

        console.log('[ep_image_insert] Paste event detected.');
        let foundImage = false;

        // Iterate through clipboard items
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
                console.log('[ep_image_insert] Pasted image file found:', file.name, file.type, file.size);
                foundImage = true; 

                // --- Validation (Simplified duplicate from toolbar.js) ---
                let isValid = true;
                const errorTitle = html10n.get('ep_image_insert.error.title');
                // Mime Type Check
                if (clientVars.ep_image_insert && clientVars.ep_image_insert.fileTypes) {
                    const mimedb = clientVars.ep_image_insert.mimeTypes;
                    const mimeTypeInfo = mimedb[file.type];
                    let validMime = false;
                    if (mimeTypeInfo && mimeTypeInfo.extensions) {
                       for (const fileType of clientVars.ep_image_insert.fileTypes) {
                           if (mimeTypeInfo.extensions.includes(fileType)) {
                               validMime = true;
                               break;
                           }
                       }
                    }
                    if (!validMime) {
                       const errorMessage = html10n.get('ep_image_insert.error.fileType');
                       $.gritter.add({ title: errorTitle, text: errorMessage, sticky: true, class_name: 'error' });
                       isValid = false;
                    }
                }
                // File Size Check
                if (isValid && clientVars.ep_image_insert && file.size > clientVars.ep_image_insert.maxFileSize) {
                   const allowedSize = (clientVars.ep_image_insert.maxFileSize / 1000000);
                   const errorText = html10n.get('ep_image_insert.error.fileSize', { maxallowed: allowedSize });
                   $.gritter.add({ title: errorTitle, text: errorText, sticky: true, class_name: 'error' });
                   isValid = false;
                }
                // --- End Validation ---

                if (isValid) {
                    evt.preventDefault(); // Prevent default paste ONLY if we handle a valid image
                    console.log('[ep_image_insert] Pasted image is valid. Reading file...');
                    const reader = new FileReader();
                    reader.onload = (e_reader) => {
                        const data = e_reader.target.result;
                        const img = new Image();
                        img.onload = () => {
                            const widthPx = `${img.naturalWidth}px`;
                            const heightPx = `${img.naturalHeight}px`;
                            console.log(`[ep_image_insert paste] Image loaded: ${widthPx} x ${heightPx}. Inserting...`);
                            _aceContext.callWithAce((ace) => {
                                // Insert image at current cursor pos
                                ace.ace_doInsertImage(data, widthPx, heightPx);
                            }, 'pasteImage', true);
                        };
                        img.onerror = () => {
                            console.error('[ep_image_insert paste] Failed to load pasted image data. Inserting without dimensions.');
                            _aceContext.callWithAce((ace) => {
                                ace.ace_doInsertImage(data); // Insert without dimensions
                            }, 'pasteImageError', true);
                        };
                        img.src = data;
                    };
                    reader.onerror = (e_reader) => {
                         console.error('[ep_image_insert paste] FileReader error:', e_reader);
                         $.gritter.add({ title: errorTitle, text: 'Error reading pasted image file.', sticky: true, class_name: 'error' });
                    };
                    reader.readAsDataURL(file);
                }
                
                // Handle only the first image found
                break; 
            }
        }
        
        if (foundImage) {
             // We already called preventDefault if the image was valid and handled
        } else {
            console.log('[ep_image_insert] No image file found in paste data.');
            // Allow default paste for non-image content
        }
    });
    // --- End Paste Listener ---

    // Add a click listener to deselect image if clicked outside
    $(innerDoc).on('mousedown', function(evt) {
        if (!$(evt.target).closest('.inline-image.image-placeholder').length) {
             $inner.find('.inline-image.image-placeholder.selected').removeClass('selected');
        }
    });

    console.log('[ep_image_insert postAceInit] Event listeners attached.');

  }, 'image_resize_listeners', true);
};

// Helper function from old plugin to find line number based on DOM element
function _getLineNumberOfElement(element) {
  let currentElement = element;
  let count = 0;
  while (currentElement = currentElement.previousElementSibling) {
    count++;
  }
  return count;
}

// Helper function (if needed elsewhere, otherwise keep inside postAceInit)
/*
function getAllPrevious(element) {
  let prev = element.previousSibling;
  let i = 0;
  while (prev) {
    prev = prev.previousSibling;
    i++;
  }
  return i;
}
*/

exports.aceEditorCSS = (hookName, context) => {
  console.log(`[ep_image_insert aceEditorCSS] Adding CSS rules.`);
  // Return an array containing only the relative path(s) to actual CSS files.
  // CSS rules themselves should be inside these files.
  return [
    'ep_image_insert/static/css/ace.css'
    // Removed shared.css (404) and inline rules (moved to ace.css)
];
};

// Only register 'img' as the block element
exports.aceRegisterBlockElements = () => ['img'];

exports.aceCreateDomLine = (hookName, args, cb) => {
  // Log entry point and initial arguments, ALWAYS log the input cls
  console.log(`[ep_image_insert aceCreateDomLine L#${args.lineNumber}] HOOK ENTRY. Input cls: "${args.cls}"`);

  if (args.cls && args.cls.indexOf('image:') >= 0) { // Added check for args.cls existence
    console.log(`[ep_image_insert aceCreateDomLine L#${args.lineNumber}] Found image class in: ${args.cls}`);
    console.log('[ep_image_insert aceCreateDomLine] Full args for image line:', args); // ADDED LOGGING
    const clss = []; // Classes to keep
    let escapedSrc;
    const argClss = args.cls.split(' ');

    // Extract the image src and separate other classes
    for (let i = 0; i < argClss.length; i++) {
      const cls = argClss[i];
      if (cls.startsWith('image:')) {
        escapedSrc = cls.substring(6); // Keep the image:* class for later use
        clss.push(cls); // Keep the image:* class itself
      } else {
        clss.push(cls);
      }
    }
    // Log remaining classes after extracting image:
    console.log(`[ep_image_insert aceCreateDomLine L#${args.lineNumber}] Original classes kept: "${clss.join(' ')}". Extracted src: ${escapedSrc}`);

    // Add identifying classes for styling and placeholder identification
    clss.push('inline-image', 'character', 'image-placeholder');

    // Modifier: Inject an empty inner span and resize handles
    const handleHtml = 
      '<span class="image-resize-handle tl"></span>' +
      '<span class="image-resize-handle tr"></span>' +
      '<span class="image-resize-handle bl"></span>' +
      '<span class="image-resize-handle br"></span>';
    const modifier = {
      extraOpenTags: `<span class="image-inner"></span>${handleHtml}`, // Inject inner span AND handles
      extraCloseTags: '', // No closing tag needed here as handles are self-contained
      cls: clss.join(' '), // Pass modified classes back for the outer span
    };

    // Log output modifier
    console.log(`[ep_image_insert aceCreateDomLine L#${args.lineNumber}] FINAL (placeholder): Output modifier:`, JSON.stringify(modifier));
    return cb([modifier]);

  } else {
    // Log when the hook runs but doesn't find the image class
    // console.log(`[ep_image_insert aceCreateDomLine L#${args.lineNumber}] Skipping: No image: prefix found in cls: "${args.cls}".`);
    return cb(); // Continue default processing if no image class found
  }
};

const Changeset = require('ep_etherpad-lite/static/js/Changeset');
exports.acePostWriteDomLineHTML = (hookName, context) => {
  // The line node is passed in context.node for this hook
  const lineNode = context.node; 
  if (!lineNode) {
    console.log('[ep_image_insert acePostWriteDomLineHTML] No lineNode (context.node) found. Context:', context);
    console.log('[ep_image_insert acePostWriteDomLineHTML] Exiting hook.');
    return; 
  }

  console.log(`[ep_image_insert acePostWriteDomLineHTML] Running for lineNode:`, lineNode);

  // Use querySelectorAll instead of jQuery find
  const placeholders = lineNode.querySelectorAll('span.image-placeholder');
  console.log(`[ep_image_insert acePostWriteDomLineHTML] Found ${placeholders.length} placeholder spans using querySelectorAll.`);

  // Note: querySelectorAll returns a NodeList, not a jQuery object
  placeholders.forEach((placeholder, index) => { 
    const outerSpan = placeholder; // Clarity: this is the outer span
    console.log(`[ep_image_insert acePostWriteDomLineHTML] Processing placeholder #${index}:`, outerSpan);

    // Use plain JS for data attribute check if possible, or wrap with $ just for this
    // Check on the inner span if it exists and has the var set
    const innerSpan = outerSpan.querySelector('span.image-inner');
    if (!innerSpan) {
        console.warn(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} outer span found, but inner span.image-inner is missing.`);
        return; // Skip if inner span isn't there
    }
    if ($(innerSpan).data('css-var-set')) {
        console.log(`[ep_image_insert acePostWriteDomLineHTML] CSS var already set for placeholder #${index}, skipping.`);
        return;
    }

    let escapedSrc = null;
    let imageWidth = null; // Variable to store width
    let imageHeight = null; // Variable to store height
    const classes = outerSpan.className.split(' '); // Get classes from outer span
    console.log(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} classes:`, classes);
    for (const cls of classes) {
      if (cls.startsWith('image:')) {
        escapedSrc = cls.substring(6);
        console.log(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} extracted escapedSrc.`);
        // Don't break yet, might need width class
      } else if (cls.startsWith('image-width:')) {
        const widthValue = cls.substring(12);
        if (/\d+px$/.test(widthValue)) { // Validate format again
          imageWidth = widthValue;
          console.log(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} extracted imageWidth: ${imageWidth}`);
        }
      } else if (cls.startsWith('image-height:')) {
        const heightValue = cls.substring(13);
        if (/\d+px$/.test(heightValue)) { // Validate format again
          imageHeight = heightValue;
          console.log(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} extracted imageHeight: ${imageHeight}`);
        }
      }
    }

    // Apply width style if found
    if (imageWidth) {
      innerSpan.style.width = imageWidth;
      console.log(`[ep_image_insert acePostWriteDomLineHTML] Applied width style ${imageWidth} to inner span.`);
    } else {
      // Optional: Apply a default width if no attribute is set?
      // innerSpan.style.width = '100px'; // Example default
    }

    // Apply height style if found
    if (imageHeight) {
      innerSpan.style.height = imageHeight;
      console.log(`[ep_image_insert acePostWriteDomLineHTML] Applied height style ${imageHeight} to inner span.`);
    } else {
      // Optional: Apply a default height if no attribute is set?
      // innerSpan.style.height = '50px'; // Example default
    }

    if (escapedSrc) {
      try {
        const src = decodeURIComponent(escapedSrc);
        if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/'))) {
          console.log(`[ep_image_insert acePostWriteDomLineHTML] Setting CSS var --image-src for placeholder #${index}`);
          // Set CSS custom property using plain JS on the INNER span
          innerSpan.style.setProperty('--image-src', `url("${src}")`);
          // Mark as processed using jQuery data on the INNER span
          $(innerSpan).data('css-var-set', true);
        } else {
          console.warn(`[ep_image_insert acePostWriteDomLineHTML] Invalid unescaped src found for CSS var: ${src}`);
          $(innerSpan).data('css-var-set', true); // Mark anyway
        }
      } catch (e) {
        console.error(`[ep_image_insert acePostWriteDomLineHTML] Error setting CSS var for placeholder #${index}:`, e);
        $(innerSpan).data('css-var-set', true); // Mark anyway
      }
  } else {
      console.warn(`[ep_image_insert acePostWriteDomLineHTML] Placeholder #${index} found, but no image:* class with src.`);
      $(innerSpan).data('css-var-set', true); // Mark anyway
    }
  });

  console.log(`[ep_image_insert acePostWriteDomLineHTML] Finished processing lineNode.`);
};

exports.aceAttribClasses = (hook, attr) => {
  // This hook is declared in ep.json but currently unused.
  // Return empty array as per Etherpad hook docs
  return []; 
};

/**
 * Hook to update attributes based on the final DOM state after content collection.
 */
exports.collectContentPost = function(name, context) {
  console.log(`[ep_image_insert collectContentPost ENTRY] tname: ${context.tname}, node classList: ${context.node ? context.node.classList : 'NO NODE'}`);
  const node = context.node;
  const state = context.state;
  const tname = context.tname;

  // Check if it's our INNER image span (REVERTED)
  if (tname === 'span' && node && node.classList && node.classList.contains('image-inner')) {
    console.log('[ep_image_insert collectContentPost] Processing image-inner span (HOOK MAY NOT FIRE RELIABLY):', node);

    // Use the node directly as innerNode
    const innerNode = node;
 
    let widthPx = null;
    let heightPx = null;

    // --- Update image-width based on style ---
    console.log(`[ep_image_insert collectContentPost] Reading innerNode.style.width: "${innerNode.style.width}"`);
    if (innerNode.style && innerNode.style.width) {
       const widthMatch = innerNode.style.width.match(/^(\d+)(?:px)?$/); // Extract number from width style (assume px)
       if (widthMatch && widthMatch[1]) {
           const widthVal = parseInt(widthMatch[1], 10);
           if (!isNaN(widthVal) && widthVal > 0) {
              widthPx = `${widthVal}px`;
              console.log(`[ep_image_insert collectContentPost] Setting state.attributes.image-width = ${widthPx}`);
              state.attribs = state.attribs || {};
              state.attribs['image-width'] = widthPx;
           } else {
             console.warn('[ep_image_insert collectContentPost] Parsed width is not a positive number.');
             // Potentially remove existing attribute if style is invalid?
             // delete state.attribs['image-width']; 
           }
       } else {
           console.warn('[ep_image_insert collectContentPost] Could not parse pixel width from innerNode style:', innerNode.style.width);
       }
    } else {
        console.warn('[ep_image_insert collectContentPost] innerNode style or style.width missing for width extraction.');
        // Remove attribute if style is missing?
        // if (state.attribs) delete state.attribs['image-width'];
    }

    // --- Update image-height based on style ---
    console.log(`[ep_image_insert collectContentPost] Reading innerNode.style.height: "${innerNode.style.height}"`);
    if (innerNode.style && innerNode.style.height) {
       const heightMatch = innerNode.style.height.match(/^(\d+)(?:px)?$/); 
       if (heightMatch && heightMatch[1]) {
           const heightVal = parseInt(heightMatch[1], 10);
           if (!isNaN(heightVal) && heightVal > 0) {
              heightPx = `${heightVal}px`;
              console.log(`[ep_image_insert collectContentPost] Setting state.attributes.image-height = ${heightPx}`);
              state.attribs = state.attribs || {};
              state.attribs['image-height'] = heightPx;
           } else {
             console.warn('[ep_image_insert collectContentPost] Parsed height is not a positive number.');
             // if (state.attribs) delete state.attribs['image-height']; 
           }
       } else {
           console.warn('[ep_image_insert collectContentPost] Could not parse pixel height from innerNode style:', innerNode.style.height);
       }
    } else {
        console.warn('[ep_image_insert collectContentPost] innerNode style or style.height missing for height extraction.');
        // if (state.attribs) delete state.attribs['image-height'];
    }
  }
};

/**
 * Handle key events to prevent typing on image lines.
 */
exports.aceKeyEvent = (hookName, context, cb) => {
  const { evt, editorInfo } = context;
  const rep = editorInfo.ace_getRep();
  const lineNumber = rep.selStart[0];
  const currentColumn = rep.selStart[1]; // Cursor position BEFORE key press
  const key = evt.key;

  // Log entry
  console.log(`[ep_image_insert aceKeyEvent L#${lineNumber} C#${currentColumn}] Key: '${key}'`);

  // Simplified check: Prevent typing immediately before the final ZWSP 
  // if the character before that is the attributed NBSP? This might be too complex/
  // brittle. Let's remove the prevention logic for now.

  return cb(false); // Let Etherpad handle other keys normally
};

// Add CSS during aceInitInnerdocbodyHead hook
// ... (keep existing aceInitInnerdocbodyHead code) ...

// exports.aceInitInnerdocbodyHead = aceInitInnerdocbodyHead; // Removed this line as function is undefined
// exports.aceCreateDomLine = aceCreateDomLine; // Removed redundant export
// exports.aceAttribsToClasses = aceAttribsToClasses; // Removed redundant export
// exports.aceRegisterBlockElements = aceRegisterBlockElements; // Removed redundant export
// exports.aceEditorCSS = aceEditorCSS; // Removed redundant export

// *** ZWSP Image Insertion Logic ***
const doInsertImage = function (src, widthPx, heightPx) {
  const ZWSP = '\u200B'; // Use SINGLE backslash for correct Unicode escape
  const PLACEHOLDER = '\u200B'; // Changed from '\uFFFC' (Object Replacement Char)

  const editorInfo = this.editorInfo;
  const rep = editorInfo.ace_getRep();
  const docMan = this.documentAttributeManager;

  if (!editorInfo || !rep || !rep.selStart || !docMan || !src) {
    console.error('[ep_image_insert doInsertImage] Missing context or src');
    return;
  }

  const cursorPos = rep.selStart; // Use selection start as insertion point

  // 1. Insert ZWSP + PLACEHOLDER + ZWSP into the model
  editorInfo.ace_replaceRange(cursorPos, cursorPos, ZWSP + PLACEHOLDER + ZWSP);

  // 2. Calculate range for the placeholder character (middle character)
  const imageAttrStart = [cursorPos[0], cursorPos[1] + ZWSP.length];          // After first ZWSP
  const imageAttrEnd = [cursorPos[0], cursorPos[1] + ZWSP.length + PLACEHOLDER.length]; // Before second ZWSP

  // 3. Encode the src
  const escapedSrc = encodeURIComponent(src);

  // 4. Prepare attributes
  const attributesToSet = [['image', escapedSrc]];
  if (widthPx && /^\d+px$/.test(widthPx)) { // Validate format
      attributesToSet.push(['image-width', widthPx]);
      console.log(`[ep_image_insert doInsertImage] Applying initial image-width: ${widthPx}`);
  }
  if (heightPx && /^\d+px$/.test(heightPx)) { // Validate format
      attributesToSet.push(['image-height', heightPx]);
      console.log(`[ep_image_insert doInsertImage] Applying initial image-height: ${heightPx}`);
  }

  // 5. Apply the attributes
  console.log(`[ep_image_insert doInsertImage] Applying attributes to range:`, imageAttrStart, imageAttrEnd, attributesToSet);
  docMan.setAttributesOnRange(imageAttrStart, imageAttrEnd, attributesToSet);
};
// *** End ZWSP Logic ***

// Function to parse aline (Simplified - might need adjustment based on exact format)
/* function getAttribsAtColumn(aline, col, apool) { ... } */
