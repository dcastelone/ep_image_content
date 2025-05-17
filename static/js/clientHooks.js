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
  if (context.key === 'image' && context.value) {
    return ['image:' + context.value];
  }
  if (context.key === 'image-width' && context.value) {
    return ['image-width:' + context.value];
  }
  if (context.key === 'image-height' && context.value) {
    return ['image-height:' + context.value];
  }
  // ADDED for imageCssAspectRatio
  if (context.key === 'imageCssAspectRatio' && context.value) {
    return ['imageCssAspectRatio:' + context.value];
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
  const placeholders = $(rootElement).find('span.image-placeholder');

  placeholders.each(function() {
    const $placeholder = $(this);
    // Check if already processed to prevent infinite loops with MutationObserver
    if ($placeholder.data('processed-image')) {
        return;
    }

    const attribsData = $placeholder.data('image-attribs');
    if (typeof attribsData === 'string') {
      try {
        const imageData = JSON.parse(attribsData);

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
        } else {
          $placeholder.text('[Invalid Image]'); // Show error inline
          $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
        }
      } catch (e) {
        console.error('[ep_image_insert] Failed to parse image data:', attribsData, e); // Keep error
        $placeholder.text('[Parse Error]'); // Show error inline
        $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
      }
    } else {
      $placeholder.text('[Missing Data]'); // Show error inline
      $placeholder.data('processed-image', true); // Mark as processed to avoid retrying
    }
  });
};

// Use MutationObserver to render images when placeholders appear in the DOM
exports.postAceInit = function (hook, context) {
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
  }

  context.ace.callWithAce((ace) => {
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
    let currentVisualAspectRatioHW = 1; // ADDED for H/W ratio preservation
    let targetOuterSpan = null; // Our main placeholder span
    let targetInnerSpan = null; // The span we style with the background
    let targetLineNumber = -1; // Store line number of dragged image
    let outlineBoxPositioned = false; // NEW: Flag to track if outline is positioned
    let mousedownClientX = 0; // NEW: Record viewport X on mousedown
    let mousedownClientY = 0; // NEW: Record viewport Y on mousedown
    let clickedHandle = null; // NEW: Store which handle was clicked ('tl', 'tr', 'bl', 'br')

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
            $targetOuterSpan.removeClass('selected'); // Deselect if invalid
            return;
        }

        const target = $(evt.target);
        const isResizeHandle = target.hasClass('image-resize-handle');

        if (isResizeHandle) {
            isDragging = true;
            outlineBoxPositioned = false; // Reset flag on new drag start
            startX = evt.clientX; // Keep relative mouse tracking start point
            mousedownClientX = evt.clientX; // Record viewport X
            mousedownClientY = evt.clientY; // Record viewport Y
            startWidth = targetInnerSpan.offsetWidth || parseInt(targetInnerSpan.style.width, 10) || 0;
            startHeight = targetInnerSpan.offsetHeight || parseInt(targetInnerSpan.style.height, 10) || 0;
            currentVisualAspectRatioHW = (startWidth > 0 && startHeight > 0) ? (startHeight / startWidth) : 1;

            if (target.hasClass('tl')) clickedHandle = 'tl';
            else if (target.hasClass('tr')) clickedHandle = 'tr';
            else if (target.hasClass('bl')) clickedHandle = 'bl';
            else if (target.hasClass('br')) clickedHandle = 'br';
            else clickedHandle = null;

            // Store line number and calculate column index
            const lineElement = $(targetOuterSpan).closest('.ace-line')[0]; // Get the main line DIV

            if (lineElement) {
                const allImagePlaceholdersInLine = Array.from(lineElement.querySelectorAll('.inline-image.image-placeholder'));
                const imageIndex = allImagePlaceholdersInLine.indexOf(targetOuterSpan);

                if (imageIndex === -1) {
                    console.error('[ep_image_insert mousedown] Clicked image placeholder not found within its line DOM elements.');
                    isDragging = false; // Stop drag
                    $targetOuterSpan.removeClass('selected');
                    targetOuterSpan = null;
                    return;
                }

                targetLineNumber = _getLineNumberOfElement(lineElement);
                $(targetOuterSpan).attr('data-line', targetLineNumber);

                _aceContext.callWithAce((ace) => {
                    const rep = ace.ace_getRep();
                    if (!rep.lines.atIndex(targetLineNumber)) {
                        console.error(`[ep_image_insert mousedown] Line ${targetLineNumber} does not exist in rep.`);
                        $(targetOuterSpan).removeAttr('data-col'); // Clear potentially stale data
                        return;
                    }
                    const lineText = rep.lines.atIndex(targetLineNumber).text;
                    const placeholderSequence = '\u200B\u200B\u200B'; // ZWSP + Placeholder + ZWSP
                    const placeholderSequenceLength = placeholderSequence.length;

                    let colStart = -1;
                    let searchFromIndex = 0;

                    for (let k = 0; k <= imageIndex; k++) {
                        const foundIndex = lineText.indexOf(placeholderSequence, searchFromIndex);
                        if (foundIndex === -1) {
                            colStart = -1;
                            break;
                        }
                        if (k === imageIndex) {
                            colStart = foundIndex;
                            break;
                        }
                        searchFromIndex = foundIndex + placeholderSequenceLength; // Correctly advance search index
                    }

                    if (colStart >= 0) {
                        $(targetOuterSpan).attr('data-col', colStart);
                    } else {
                        console.error(`[ep_image_insert mousedown] Could not find the ${imageIndex}-th placeholder sequence in line text for line ${targetLineNumber}: "${lineText}"`);
                        $(targetOuterSpan).removeAttr('data-col');
                    }
                }, 'getImageColStart', true);
            } else {
                console.error('[ep_image_insert mousedown] Could not find parent .ace-line for the clicked image.');
                isDragging = false; // Stop drag
                $targetOuterSpan.removeClass('selected');
                targetOuterSpan = null;
                return;
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
                 
                 // 1. Get Dimensions from mousedown (startWidth/startHeight)
                 const currentWidth = startWidth; 
                 const currentHeight = startHeight;

                 if (currentWidth <= 0 || currentHeight <= 0) {
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

                if (targetOuterSpan) {
                    const $tableCell = $(targetOuterSpan).closest('td, th');
                    if ($tableCell.length > 0) {
                        const parentWidth = $tableCell.width();
                        if (parentWidth > 0) { // Ensure parentWidth is positive
                           newPixelWidth = Math.min(newPixelWidth, parentWidth);
                        }
                    }
                }

                newPixelWidth = Math.max(20, newPixelWidth); // Apply min width *after* parent constraint

                const newPixelHeight = newPixelWidth * currentVisualAspectRatioHW; // Use currentVisualAspectRatioHW
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
            const finalX = evt.clientX;
            const deltaX = finalX - startX;
            let finalPixelWidth = startWidth + deltaX;

            if (targetOuterSpan) {
                const $tableCell = $(targetOuterSpan).closest('td, th');
                if ($tableCell.length > 0) {
                    const parentWidth = $tableCell.width();
                     if (parentWidth > 0) { // Ensure parentWidth is positive
                        finalPixelWidth = Math.min(finalPixelWidth, parentWidth);
                    }
                }
            }

            finalPixelWidth = Math.max(20, Math.round(finalPixelWidth)); // Apply min width *after* parent constraint & rounding
            const widthToApply = `${finalPixelWidth}px`;

            const finalPixelHeight = Math.round(finalPixelWidth * currentVisualAspectRatioHW); // Use currentVisualAspectRatioHW
            const heightToApplyPx = `${finalPixelHeight}px`; // For attribute storage
            const newCssAspectRatioForVar = (startWidth > 0 && startHeight > 0) ? (startWidth / startHeight).toFixed(4) : '1'; // W/H for CSS var

            if (targetInnerSpan) {
                $(targetInnerSpan).css({
                    'width': widthToApply,
                });
                targetInnerSpan.style.removeProperty('height'); // Ensure no inline height style
                targetInnerSpan.style.setProperty('--image-css-aspect-ratio', newCssAspectRatioForVar);

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
                    } else {
                         console.error('[ep_image_insert mouseup] Invalid line/col data attributes:', lineStr, colStr);
                    }
                } else {
                     console.error('[ep_image_insert mouseup] Missing line/col data attributes.');
                }
            }

            if (targetRange) {
                 _aceContext.callWithAce((ace) => {
                     ace.ace_performDocumentApplyAttributesToRange(targetRange[0], targetRange[1], [
                         ['image-width', widthToApply],
                         ['image-height', heightToApplyPx], // Store calculated pixel height
                         ['imageCssAspectRatio', newCssAspectRatioForVar] // Store W/H CSS aspect ratio
                     ]);
                 }, 'applyImageAttributes', true); // Changed attribute name for clarity
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

        let foundImage = false;

        // Iterate through clipboard items
        for (let i = 0; i < clipboardData.items.length; i++) {
            const item = clipboardData.items[i];
            if (item.kind === 'file' && item.type.startsWith('image/')) {
                const file = item.getAsFile();
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
                    const reader = new FileReader();
                    reader.onload = (e_reader) => {
                        const data = e_reader.target.result;
                        const img = new Image();
                        img.onload = () => {
                            const widthPx = `${img.naturalWidth}px`;
                            const heightPx = `${img.naturalHeight}px`;
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
  if (args.cls && args.cls.indexOf('image:') >= 0) { // Added check for args.cls existence
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

    return cb([modifier]);

  } else {
    return cb(); // Continue default processing if no image class found
  }
};

const Changeset = require('ep_etherpad-lite/static/js/Changeset');
exports.acePostWriteDomLineHTML = (hookName, context) => {
  const lineNode = context.node; 
  if (!lineNode) {
    return; 
  }

  const placeholders = lineNode.querySelectorAll('span.image-placeholder');

  // Note: querySelectorAll returns a NodeList, not a jQuery object
  placeholders.forEach((placeholder, index) => { 
    const outerSpan = placeholder; // Clarity: this is the outer span

    const innerSpan = outerSpan.querySelector('span.image-inner');
    if (!innerSpan) {
        return; // Skip if inner span isn't there
    }

    let escapedSrc = null;
    let imageWidth = null; // Variable to store width
    let imageCssAspectRatioVal = null; // ADDED
    const classes = outerSpan.className.split(' '); 
    for (const cls of classes) {
      if (cls.startsWith('image:')) {
        escapedSrc = cls.substring(6);
      } else if (cls.startsWith('image-width:')) {
        const widthValue = cls.substring(12);
        if (/\d+px$/.test(widthValue)) { // Validate format again
          imageWidth = widthValue;
        }
      } else if (cls.startsWith('imageCssAspectRatio:')) { // ADDED
        imageCssAspectRatioVal = cls.substring(20);
      }
    }

    // Apply width style if found
    if (imageWidth) {
      innerSpan.style.width = imageWidth;
    } else {
      // Optional: Apply a default width if no attribute is set?
      // innerSpan.style.width = '100px'; // Example default
    }

    // Apply CSS Aspect Ratio variable if found
    if (imageCssAspectRatioVal) {
      innerSpan.style.setProperty('--image-css-aspect-ratio', imageCssAspectRatioVal);
    } else {
      // Fallback or default aspect ratio if attribute is missing (e.g. for older content)
      innerSpan.style.setProperty('--image-css-aspect-ratio', '1'); // Default to 1:1 (W/H)
    }
    innerSpan.style.removeProperty('height'); // Ensure explicit height removed for aspect-ratio to work

    if (escapedSrc) {
      try {
        const src = decodeURIComponent(escapedSrc);
        if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/'))) {
          // Set CSS custom property using plain JS on the INNER span
          innerSpan.style.setProperty('--image-src', `url("${src}")`);
        } else {
        }
      } catch (e) {
        console.error(`[ep_image_insert acePostWriteDomLineHTML] Error setting CSS var for placeholder #${index}:`, e);
      }
    } else {
      }
  });

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
  const node = context.node;
  const state = context.state;
  const tname = context.tname;

  // Check if it's our INNER image span (REVERTED)
  if (tname === 'span' && node && node.classList && node.classList.contains('image-inner')) {

    // Use the node directly as innerNode
    const innerNode = node;
 
    let widthPx = null;
    let heightPx = null;

    // --- Update image-width based on style ---
    if (innerNode.style && innerNode.style.width) {
       const widthMatch = innerNode.style.width.match(/^(\d+)(?:px)?$/); // Extract number from width style (assume px)
       if (widthMatch && widthMatch[1]) {
           const widthVal = parseInt(widthMatch[1], 10);
           if (!isNaN(widthVal) && widthVal > 0) {
              widthPx = `${widthVal}px`;
              // Try to get offsetWidth for more accuracy if available and different
              if (innerNode.offsetWidth && innerNode.offsetWidth !== widthVal) {
                  widthPx = `${innerNode.offsetWidth}px`;
              }
              state.attribs = state.attribs || {};
              state.attribs['image-width'] = widthPx;
           } else {
           }
       } else {
       }
    } else {
        // Remove attribute if style is missing?
        // if (state.attribs) delete state.attribs['image-width'];
    }

    // --- Update image-height based on style ---
    if (innerNode.style && innerNode.style.height) {
       const heightMatch = innerNode.style.height.match(/^(\d+)(?:px)?$/); 
       if (heightMatch && heightMatch[1]) {
           const heightVal = parseInt(heightMatch[1], 10);
           if (!isNaN(heightVal) && heightVal > 0) {
              heightPx = `${heightVal}px`;
              state.attribs = state.attribs || {};
              state.attribs['image-height'] = heightPx;
           } else {
           }
       } else {
       }
    } else {
    }

    // Update imageCssAspectRatio attribute from computed style
    // This ensures it reflects the visual aspect ratio preserved by resize, or natural on insert
    const computedStyle = window.getComputedStyle(innerNode);
    const cssAspectRatioFromVar = computedStyle.getPropertyValue('--image-css-aspect-ratio');
    if (cssAspectRatioFromVar && cssAspectRatioFromVar.trim() !== '') {
        state.attribs = state.attribs || {};
        state.attribs['imageCssAspectRatio'] = cssAspectRatioFromVar.trim();
    } else {
        // Fallback: calculate from offsetWidth/offsetHeight if var somehow missing
        if (innerNode.offsetWidth > 0 && innerNode.offsetHeight > 0) {
            const calculatedCssAspectRatio = (innerNode.offsetWidth / innerNode.offsetHeight).toFixed(4);
            state.attribs = state.attribs || {};
            state.attribs['imageCssAspectRatio'] = calculatedCssAspectRatio;
        }
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

  return cb(false); // Let Etherpad handle other keys normally
};

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
  }
  if (heightPx && /^\d+px$/.test(heightPx)) { // Validate format
      attributesToSet.push(['image-height', heightPx]);
  }
  // ADDED: Add imageCssAspectRatio from natural dimensions
  if (widthPx && heightPx) {
    const naturalWidthNum = parseInt(widthPx, 10);
    const naturalHeightNum = parseInt(heightPx, 10);
    if (naturalWidthNum > 0 && naturalHeightNum > 0) {
        const cssAspectRatio = (naturalWidthNum / naturalHeightNum).toFixed(4);
        attributesToSet.push(['imageCssAspectRatio', cssAspectRatio]);
    }
  }

  // 5. Apply the attributes
  docMan.setAttributesOnRange(imageAttrStart, imageAttrEnd, attributesToSet);
};
// *** End ZWSP Logic ***

// Function to parse aline (Simplified - might need adjustment based on exact format)
/* function getAttribsAtColumn(aline, col, apool) { ... } */
