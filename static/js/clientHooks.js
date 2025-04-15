'use strict';

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

exports.aceAttribsToClasses = (name, context) => {
  // Log for ALL keys to see the sequence
  console.log(`[ep_image_insert aceAttribsToClasses] Processing key: ${context.key}, value: ${context.value}`);

  if (context.key === 'img') {
    const imgUrl = context.value;
    // Stricter validation: Check if it looks like a valid URL or data URI
    if (imgUrl && (imgUrl.startsWith('data:') || imgUrl.startsWith('http') || imgUrl.startsWith('/'))) {
      const cls = `img:${imgUrl}`;
      console.log(`[ep_image_insert aceAttribsToClasses] Returning class for key 'img': ${cls}`);
      return [cls];
    } else {
      console.warn(`[ep_image_insert aceAttribsToClasses] Received invalid value for 'img' attribute: "${imgUrl}". Ignoring.`);
      return []; // Return empty class array if value is invalid
    }
  }
  if (context.key === 'imgWidth') {
    const cls = `imgWidth:${context.value}`;
    console.log(`[ep_image_insert aceAttribsToClasses] Returning class for key 'imgWidth': ${cls}`);
    return [cls];
  }
  if (context.key === 'imgAlign') {
    const cls = `imgAlign:${context.value}`;
    console.log(`[ep_image_insert aceAttribsToClasses] Returning class for key 'imgAlign': ${cls}`);
    return [cls];
  }
};

// Rewrite the DOM contents when an IMG attribute is discovered
exports.aceDomLineProcessLineAttributes = (name, context) => {
  const currentLineNumber = context.lineNumber; // Get line number
  console.log(`[ep_image_insert aceDomLineProcessLineAttributes L#${currentLineNumber}] Input context.cls: ${context.cls}`);
  
  // --- Robust source extraction from class list ---
  let imgSrcFromClass = null;
  const classes = context.cls.split(' ');
  for (const cls of classes) {
      if (cls.startsWith('img:')) {
          imgSrcFromClass = cls.substring(4); // Get the part after "img:"
          break; // Found it
      }
  }
  console.log(`[ep_image_insert aceDomLineProcessLineAttributes L#${currentLineNumber}] Extracted img src from class: ${imgSrcFromClass}`);

  // Basic validation: Check if it looks like a data URI or a common URL start, and NOT "<img"
  let isValidSrc = imgSrcFromClass && imgSrcFromClass !== '<img' && (imgSrcFromClass.startsWith('data:') || imgSrcFromClass.startsWith('http') || imgSrcFromClass.startsWith('/'));

  if (!isValidSrc) {
      // Source from class is invalid. Log it and return nothing to prevent modification.
      console.warn(`[ep_image_insert aceDomLineProcessLineAttributes L#${currentLineNumber}] Invalid or missing image source in class list: ${imgSrcFromClass}. Preserving existing DOM.`);
      return []; 
  }
  
  const expWidth = /(?:^| )imgWidth:((\S+))/;
  const imgWidth = expWidth.exec(context.cls);
  const expAlign = /(?:^| )imgAlign:((\S+))/;
  const imgAlign = expAlign.exec(context.cls);

  if (!imgSrcFromClass) return [];
  
  let width = '50';
  let height = '50';
  let imgPos = 'none';

  if (imgWidth) {
    width = imgWidth[1];
  }

  if (imgAlign) {
    imgPos = imgAlign[1];
  }

  // Generate a more stable ID based on the validated image source
  let stableId = 'img_' + imgSrcFromClass.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0); 
  // Ensure ID is valid for HTML4 (starts with letter, contains letters, digits, hyphens, underscores)
  stableId = stableId.toString().replace(/^-/, 'id-').replace(/[^A-Za-z0-9_-]/g, '_');
  
  // Ensure data-img-src attribute is added
  let template = `<span id="${stableId}" class="image" data-img-src="${imgSrcFromClass}" style="width:${width}%;float:${imgPos}">`;
  
  // Use the validated imgSrcFromClass
  console.log(`[ep_image_insert aceDomLineProcessLineAttributes L#${currentLineNumber}] Using validated img src: ${imgSrcFromClass}`); 
  // Add handle spans inside the main span
  const handleHtml = 
    '<span class="image-resize-handle tl"></span>' +
    '<span class="image-resize-handle tr"></span>' +
    '<span class="image-resize-handle bl"></span>' +
    '<span class="image-resize-handle br"></span>';
  const preHtml = `${template} ${handleHtml} <img src="${imgSrcFromClass}" style="height:${height}%;width:100%;">`;
    const modifier = {
      preHtml,
    postHtml: '</span>',
      processedMarker: true,
    };
    return [modifier];
};

exports.aceInitialized = (hook, context) => {
  const editorInfo = context.editorInfo;
  editorInfo.ace_addImage = image.addImage.bind(context);
  editorInfo.ace_setImageSize = image.setImageSize.bind(context);
  editorInfo.ace_setImageAlign = image.setImageAlign.bind(context);
  editorInfo.ace_removeImage = image.removeImage.bind(context);

  // Add the missing getter function
  editorInfo.ace_getAttributeOnLine = function(lineNumber, key) {
    // Ensure documentAttributeManager exists on the context
    if (this.documentAttributeManager) {
      return this.documentAttributeManager.getAttributeOnLine(lineNumber, key);
    }
    console.error('[ep_image_insert] documentAttributeManager not found on context in ace_getAttributeOnLine');
    return undefined; 
  }.bind(context);
};

// Handle click events
exports.postAceInit = function (hook, context) {
  console.log('ep_image_insert: postAceInit hook running.');

  const padOuter = $('iframe[name="ace_outer"]').contents().find('body');
  console.log('[ep_image_insert] padOuter element reference:', padOuter[0]); // Log the element
  
  // --- Create Resize Outline Box ---
  const $outlineBox = $('<div id="imageResizeOutline"></div>');
  $outlineBox.css({
      position: 'absolute',
      // border: '2px solid #1a73e8', // Remove border
      backgroundColor: 'rgba(26, 115, 232, 0.3)', // Use semi-transparent background
      'pointer-events': 'none', 
      display: 'none',
      'z-index': 1000, // Ensure it's on top
      'box-sizing': 'border-box' // Include border in width/height
  });
  padOuter.append($outlineBox);
  // --------------------------------

  context.ace.callWithAce((ace) => {
    console.log('ep_image_insert: Inside callWithAce callback.');

    // Try finding the inner iframe document directly using selectors
    const $outerIframe = $('iframe[name="ace_outer"]');
    console.log(`[ep_image_insert] Found outer iframe? Length: ${$outerIframe.length}`);
    if ($outerIframe.length === 0) {
        console.error('ep_image_insert: ERROR - Could not find outer iframe (ace_outer).');
        return;
    }
    // Note: Etherpad uses ace_inner iframe inside ace_outer
    const $innerIframe = $outerIframe.contents().find('iframe[name="ace_inner"]');
    console.log(`[ep_image_insert] Found inner iframe? Length: ${$innerIframe.length}`);
    if ($innerIframe.length === 0) {
        console.error('ep_image_insert: ERROR - Could not find inner iframe (ace_inner) inside ace_outer.');
        // Log outer iframe contents for debugging
        console.log('ep_image_insert: ace_outer contents:', $outerIframe.contents().find('body').html());
        return;
    }

    console.log('[ep_image_insert] Attaching drag listeners directly...'); // New log
    const innerDocBody = $innerIframe.contents().find('body')[0]; // Get the raw body element
    const $inner = $(innerDocBody); // Wrap with jQuery
    const innerDoc = $innerIframe.contents(); // Get inner document for mousemove/up

    if (!$inner || $inner.length === 0) { // Check if $inner is valid
        console.error('ep_image_insert: ERROR - Could not get body from inner iframe.');
        return; // Exit if body not found
    }
    console.log('[ep_image_insert] Found inner iframe body directly:', $inner[0]);

    // Drag state variables
    let isDragging = false; // For RESIZE
    let isMoving = false; // For MOVE
    let startWidth = 0;
    let startX = 0;
    let targetImageElement = null;
    let targetLineNumber = -1; // For RESIZE target line
    let startMoveLineNumber = -1; // For MOVE start line
    let parentContainerWidth = 0;
    let capturedImgSrc = null; // Variable to store captured image source
    let startHeight = 0;       // Variable for initial height
    let aspectRatio = 1;       // Variable for aspect ratio

    // --- Add Mousedown Listener --- 
    $inner.on('mousedown', '.image', function(evt) {
      // Only handle left clicks
      if (evt.button !== 0) return;

      // Determine if it's a resize handle or the image body
      const isResizeHandle = $(evt.target).hasClass('image-resize-handle');
      targetImageElement = this; // The <span class="image"> element
      // Always capture image source on mousedown
      capturedImgSrc = targetImageElement.dataset.imgSrc;
      console.log(`[ep_image_insert] mousedown captured src: ${capturedImgSrc}`);

      if (isResizeHandle) {
        console.log('[ep_image_insert] mousedown on resize handle');
        isDragging = true; // Flag for RESIZE drag
        isMoving = false; // Ensure not moving
        // RESIZE specific setup:
        startX = evt.clientX;
        startWidth = targetImageElement.offsetWidth; // Start width in pixels
        startHeight = targetImageElement.offsetHeight; // Capture start height
        aspectRatio = (startWidth > 0) ? (startHeight / startWidth) : 1;
        parentContainerWidth = targetImageElement.parentNode.offsetWidth; // Width of the line container
        targetLineNumber = getAllPrevious(targetImageElement.parentNode).length;
        
        // --- Positioning Logic for Outline Box (Keep the last working version) ---
        // --- Positioning Logic: Relative Chain (Img->Inner->Outer) using Rects + Scroll - Adding Padding ---
        const imgTag = targetImageElement.querySelector('img');
        if (!imgTag) return;

        // 1. Rects & Scrolls
        const imgRect = imgTag.getBoundingClientRect();              // Img relative to viewport
        const innerBodyRect = innerDocBody.getBoundingClientRect();    // Inner Body relative to viewport
        const innerIframeRect = $innerIframe[0].getBoundingClientRect(); // Inner Iframe element relative to viewport
        const outerBodyRect = padOuter[0].getBoundingClientRect();     // Outer Body relative to viewport
        
        const scrollTopInner = innerDocBody.scrollTop;
        const scrollLeftInner = innerDocBody.scrollLeft;
        const scrollTopOuter = padOuter.scrollTop();
        const scrollLeftOuter = padOuter.scrollLeft();

        // 2. Image relative to SCROLLED Inner Body
        const imgTopRelInner = imgRect.top - innerBodyRect.top + scrollTopInner;
        const imgLeftRelInner = imgRect.left - innerBodyRect.left + scrollLeftInner;

        // 3. Inner Iframe relative to SCROLLED Outer Body
        const innerFrameTopRelOuter = innerIframeRect.top - outerBodyRect.top + scrollTopOuter;
        const innerFrameLeftRelOuter = innerIframeRect.left - outerBodyRect.left + scrollLeftOuter;

        // 4. Base Position (Relative to Outer Body) = InnerFrame's pos + Image's pos within InnerFrame
        const calculatedFinalTop = innerFrameTopRelOuter + imgTopRelInner;
        const calculatedFinalLeft = innerFrameLeftRelOuter + imgLeftRelInner;
        const calculatedFinalWidth = imgRect.width;  // Use img dimensions from Rect
        const calculatedFinalHeight = imgRect.height; // Use img dimensions from Rect

        // 5. Adjust for Outer Padding (Adding)
        const outerPadding = window.getComputedStyle(padOuter[0]);
        const outerPaddingTop = parseFloat(outerPadding.paddingTop) || 0;
        const outerPaddingLeft = parseFloat(outerPadding.paddingLeft) || 0;

        const adjustedFinalTop = calculatedFinalTop + outerPaddingTop; // Add padding
        const adjustedFinalLeft = calculatedFinalLeft + outerPaddingLeft; // Add padding

        // 6. Manual Adjustment (Fine-tuning)
        const MANUAL_OFFSET_TOP = 5; // Pixels down (+), up (-)
        const MANUAL_OFFSET_LEFT = 40; // Pixels right (+), left (-)

        const finalTopWithManualOffset = adjustedFinalTop + MANUAL_OFFSET_TOP;
        const finalLeftWithManualOffset = adjustedFinalLeft + MANUAL_OFFSET_LEFT;

        // Log the calculated values IMMEDIATELY before applying them
        console.log(`[ep_image_insert] Positioning outline box (Relative Chain - Adjusted +Padding +Manual) at: L=${finalLeftWithManualOffset}, T=${finalTopWithManualOffset}, W=${calculatedFinalWidth}, H=${calculatedFinalHeight}`);
        console.log(`  Debug Manual: Adjusted T/L: ${adjustedFinalTop.toFixed(2)}/${adjustedFinalLeft.toFixed(2)}, Manual Offset T/L: ${MANUAL_OFFSET_TOP}/${MANUAL_OFFSET_LEFT}`);
        console.log(`  Debug Adjust: Base T/L: ${calculatedFinalTop.toFixed(2)}/${calculatedFinalLeft.toFixed(2)}, Outer Padding T/L: ${outerPaddingTop}/${outerPaddingLeft}`);
        // console.log(`  Debug Check: imgRelInner T/L: ${imgTopRelInner}/${imgLeftRelInner}, innerFrameRelOuter T/L: ${innerFrameTopRelOuter}/${innerFrameLeftRelOuter}`); // Keep log concise

        $outlineBox.css({
            left: finalLeftWithManualOffset + 'px',
            top: finalTopWithManualOffset + 'px',
            width: calculatedFinalWidth + 'px',  
            height: calculatedFinalHeight + 'px', 
            display: 'block'
        });
        // --- End Positioning Logic ---

      } else {
        // Click was on the image body, not a handle
        console.log('[ep_image_insert] mousedown on image body (MOVE action initiated)');
        isMoving = true; // Flag for MOVE drag
        isDragging = false; // Ensure not resizing
        startMoveLineNumber = getAllPrevious(targetImageElement.parentNode).length;
        console.log(`[ep_image_insert] Starting move from line: ${startMoveLineNumber}`);
        // Optionally, add visual feedback like dimming the image slightly:
        // $(targetImageElement).css('opacity', 0.6); 
      }
      
      // Prevent default text selection/image drag behavior for BOTH cases
      evt.preventDefault(); 
    });

    // --- Add Mousemove Listener (on inner document) ---
    innerDoc.on('mousemove', function(evt) {
      if (isDragging) { // RESIZE mousemove
        const currentX = evt.clientX;
        const deltaX = currentX - startX;
        let newPixelWidth = startWidth + deltaX;
        
        // Calculate percentage relative to parent container (for clamping/final value, not visual)
        let newWidthPercent = (newPixelWidth / parentContainerWidth) * 100;
        newWidthPercent = Math.max(10, Math.min(100, newWidthPercent));
        // Recalculate pixel width based on clamped percentage to avoid exceeding bounds visually
        newPixelWidth = parentContainerWidth * (newWidthPercent / 100);
        
        // Calculate proportional height
        const newPixelHeight = newPixelWidth * aspectRatio;
        
        // --- Update OUTLINE BOX width AND height --- 
        $outlineBox.css({
            width: newPixelWidth + 'px',
            height: newPixelHeight + 'px'
        });
        
        $inner.css('cursor', 'ew-resize'); 
      } else if (isMoving) { // MOVE mousemove
        // Update cursor to indicate moving
        $inner.css('cursor', 'move');
        // Later: Add logic for ghost image or line highlighting
      }
    });

    // --- Add Mouseup Listener (on inner document) ---
    innerDoc.on('mouseup', function(evt) {
      if (isDragging) { // RESIZE mouseup
        console.log('[ep_image_insert] resize mouseup after drag');
        const wasDragging = isDragging; // Store drag status
        isDragging = false;
        const currentTargetLine = targetLineNumber; // Store line number
        
        // Hide outline box
        $outlineBox.hide();
        
        // --- Recalculate final width on mouseup --- 
        const finalX = evt.clientX;
        const deltaX = finalX - startX;
        let finalPixelWidth = startWidth + deltaX;
        let finalWidthPercent = (finalPixelWidth / parentContainerWidth) * 100;
        finalWidthPercent = Math.max(10, Math.min(100, finalWidthPercent)); // Clamp
        console.log(`[ep_image_insert] resize mouseup calculated final width: ${finalWidthPercent.toFixed(0)}%`);

        if (!isNaN(finalWidthPercent) && currentTargetLine !== -1) {
          console.log(`[ep_image_insert] Resize Drag finished. Final calculated width: ${finalWidthPercent.toFixed(0)}%. Calling setImageSize.`);
          context.ace.callWithAce((ace) => {
              ace.ace_setImageSize(finalWidthPercent.toFixed(0), currentTargetLine);
          }, 'img_set_width_only', true); 
        }
          
        // Reset target and visual cues
        targetImageElement = null; 
        targetLineNumber = -1;
        startHeight = 0; // Reset height
        aspectRatio = 1; // Reset ratio
        $inner.css('cursor', 'auto'); // Reset cursor
        capturedImgSrc = null; // Reset captured src

      } else if (isMoving) { // MOVE mouseup
        console.log('[ep_image_insert] move mouseup after drag');
        const wasMoving = isMoving; // Store move status
        isMoving = false;
        const currentStartLine = startMoveLineNumber; // Store start line
        const currentImgSrc = capturedImgSrc; // Store src

        // Reset visual feedback if any was added
        // $(targetImageElement).css('opacity', 1); // Restore opacity if dimmed

        // Determine endMoveLineNumber based on evt.clientY/evt.clientX
        let endMoveLineNumber = -1; 
        try {
          const innerDocEl = innerDoc[0]; // Get the raw document element
          const clientX = evt.clientX;
          const clientY = evt.clientY;
          console.log(`[ep_image_insert] move mouseup coords (viewport): X=${clientX}, Y=${clientY}`);

          let elementAtPoint = innerDocEl.elementFromPoint(clientX, clientY);
          console.log('[ep_image_insert] Element at drop point:', elementAtPoint);
          
          let lineElement = null;
          if (elementAtPoint) {
              // Try to find the closest line div
              const $closestDiv = $(elementAtPoint).closest('div');
              // Check if it's a valid line (direct child of body, not body itself)
              if ($closestDiv.length > 0 && $closestDiv[0] !== innerDocBody && $closestDiv[0].parentNode === innerDocBody) {
                 lineElement = $closestDiv[0];
              }
          }

          if (lineElement) {
            // Valid line element found directly
            console.log('[ep_image_insert] Found target line element:', lineElement);
            endMoveLineNumber = getAllPrevious(lineElement).length;
            console.log(`[ep_image_insert] Determined end line number: ${endMoveLineNumber}`);
          } else {
            // Invalid target or dropped below content - try finding the last line
            console.warn('[ep_image_insert] Drop target was not a valid line element. Checking for last line.');
            const $lastLine = $(innerDocBody).children('div').last();
            if ($lastLine.length > 0) {
               lineElement = $lastLine[0];
               endMoveLineNumber = getAllPrevious(lineElement).length;
               console.log(`[ep_image_insert] Using last line as target: ${endMoveLineNumber}`, lineElement);
            } else {
               console.warn('[ep_image_insert] No valid last line found (empty pad?). Move cancelled.');
               endMoveLineNumber = -1; // Keep as invalid
            }
          }
        } catch (e) {
          console.error('[ep_image_insert] Error determining drop line:', e);
        }

        // Get current image width attribute *before* potentially moving
        let currentWidth = null; 
        if (currentStartLine !== -1) { // Only try if start line was valid
          try {
             // Need to use callWithAce to access attributes safely
             context.ace.callWithAce((ace) => {
               // Use the newly added function via editorInfo
               currentWidth = ace.ace_getAttributeOnLine(currentStartLine, 'imgWidth');
             }, 'img_get_width_sync', true); // Use sync call immediately
             console.log(`[ep_image_insert] Retrieved width ${currentWidth} from line ${currentStartLine}`);
          } catch (e) {
            console.error('[ep_image_insert] Error getting image width:', e);
          }
        }

        if (endMoveLineNumber !== -1 && endMoveLineNumber !== currentStartLine && currentImgSrc) {
          console.log(`[ep_image_insert] Moving image from line ${currentStartLine} to ${endMoveLineNumber}`);

      context.ace.callWithAce((ace) => {
            // Get target line details before making changes
            const targetLineEntry = ace.ace_getRep().lines.atIndex(endMoveLineNumber);
            const targetHasText = targetLineEntry && targetLineEntry.text.length > 0;
            const targetAlreadyHasImage = ace.ace_getAttributeOnLine(endMoveLineNumber, 'img');
            const shouldDisplaceText = targetHasText && !targetAlreadyHasImage;

            if (shouldDisplaceText) {
              console.log(`[ep_image_insert] Target line ${endMoveLineNumber} has text. Displacing text.`);
              // 1. Remove from old line first
              ace.ace_removeImage(currentStartLine);
              // 2. Move cursor to start of target line
              ace.ace_performSelectionChange([endMoveLineNumber, 0], [endMoveLineNumber, 0]);
              // 3. Insert newline (pushes text down)
              ace.ace_doReturnKey();
              // 4. Add image attributes to the now empty original target line number
              ace.ace_addImage(endMoveLineNumber, currentImgSrc, currentWidth);
            } else {
              // Target line is empty or already has an image, just move attributes
              console.log(`[ep_image_insert] Target line ${endMoveLineNumber} is empty or has image. Moving attributes directly.`);
              ace.ace_removeImage(currentStartLine); // Remove from old line
              ace.ace_addImage(endMoveLineNumber, currentImgSrc, currentWidth); // Add to new line with width
            }
          }, 'img_move_displace', true);
          
        } else {
           console.log(`[ep_image_insert] Move cancelled or target line is the same/invalid.`);
        }
        
        // Reset state
        $inner.css('cursor', 'auto'); // Reset cursor
        targetImageElement = null;
        startMoveLineNumber = -1;
        capturedImgSrc = null;
      }
    });

    console.log('[ep_image_insert] Drag listeners attached.');

  }, 'image', true);
};

function getAllPrevious(element) {
  var res = [];
  while (element = element.previousElementSibling) 
    res.push(element);
  return res
}

exports.aceEditorCSS = () => [
  // Only load ace.css, as other styles were consolidated into it
  '/ep_image_insert/static/css/ace.css',
  // '/ep_image_insert/static/css/ep_image_insert.css',
];

// Only register 'img' as the block element
exports.aceRegisterBlockElements = () => ['img'];

exports.aceCreateDomLine = (name, args) => {
};

exports.acePostWriteDomLineHTML = (name, context) => {
};

exports.aceAttribClasses = (hook, attr) => {
};

/**
 * Hook to ensure the 'img' attribute is correctly maintained based on the DOM state
 * during content collection.
 */
exports.collectContentImage = function(name, context){
  const node = context.node;
  const state = context.state;
  const tname = context.tname;
  let imgSrc = null;

  // Only process our specific span.image element
  if (tname !== 'span' || !node || !node.classList || !node.classList.contains('image')) {
    // console.log('[ep_image_insert collectContentImage] Skipping node:', tname, node);
    return; 
  }
  console.log('[ep_image_insert collectContentImage] Processing SPAN.IMAGE node:', node);

  // Prioritize data-img-src
  if (node.dataset && node.dataset.imgSrc) {
    imgSrc = node.dataset.imgSrc;
    console.log(`[ep_image_insert collectContentImage] Found src in data attribute: ${imgSrc}`);
  } else {
    console.warn('[ep_image_insert collectContentImage] Could not find data-img-src attribute on span.image', node);
    // DO NOT fall back to reading inner img tag src here - rely on data attribute
  }

  // Validate and set the attribute
  if (imgSrc && (imgSrc.startsWith('data:') || imgSrc.startsWith('http') || imgSrc.startsWith('/'))) {
    console.log(`[ep_image_insert collectContentImage] Setting state.lineAttributes.img = ${imgSrc}`);
    state.lineAttributes.img = imgSrc;
  } else {
    // If imgSrc is null or invalid, ensure the attribute is cleared for this line
    // But only if we actually processed our target span
    console.warn(`[ep_image_insert collectContentImage] Invalid or missing src ('${imgSrc}'). Clearing img attribute.`);
    delete state.lineAttributes.img; 
  }
};

/**
 * Hook to update attributes based on the final DOM state after content collection.
 */
exports.collectContentPost = function(name, context) {
  const node = context.node;
  const state = context.state;
  const tname = context.tname;

  // Check if it's our image span
  if (tname === 'span' && node && node.classList && node.classList.contains('image')) {
    console.log('[ep_image_insert collectContentPost] Processing image span:', node);
    console.log('[ep_image_insert collectContentPost] Span Style:', node.style.cssText);
    console.log('[ep_image_insert collectContentPost] Current Line Attributes (Before):', JSON.stringify(state.lineAttributes));

    // --- Update imgWidth based on style --- 
    let widthPercent = null; // Initialize
    if (node.style && node.style.width) {
       const widthMatch = node.style.width.match(/(\d*\.?\d+)(%?)/); // Extract number from width style
       if (widthMatch && widthMatch[1]) {
           widthPercent = parseFloat(widthMatch[1]).toFixed(0); // Get integer percentage
           if (!isNaN(widthPercent)) {
              console.log(`[ep_image_insert collectContentPost] Setting state.lineAttributes.imgWidth = ${widthPercent}`);
              state.lineAttributes.imgWidth = widthPercent;
           } else {
             console.warn('[ep_image_insert collectContentPost] Parsed width is NaN.');
             widthPercent = null; // Reset if NaN
           }
       } else {
           console.warn('[ep_image_insert collectContentPost] Could not parse width from style:', node.style.width);
       }
    } else {
        console.warn('[ep_image_insert collectContentPost] Node style or style.width missing for width extraction.');
    }

    // --- Update imgAlign based on style --- 
    let alignValue = 'none'; 
    if (node.style && node.style.float) {
        if (node.style.float === 'left') {
            alignValue = 'left';
        } else if (node.style.float === 'right') {
            alignValue = 'right';
        }
    }
    console.log(`[ep_image_insert collectContentPost] Setting state.lineAttributes.imgAlign = ${alignValue}`);
    state.lineAttributes.imgAlign = alignValue;
    
    console.log('[ep_image_insert collectContentPost] Current Line Attributes (After):', JSON.stringify(state.lineAttributes));

  }
};

/**
 * Handle key events to prevent typing on image lines.
 */
exports.aceKeyEvent = (hookName, context, cb) => {
  const { evt, editorInfo } = context;
  const rep = editorInfo.ace_getRep();
  const lineNumber = rep.selStart[0];
  const key = evt.key;

  // Check if it's a printable character (simplistic check)
  const isPrintable = key && key.length === 1 && !evt.ctrlKey && !evt.metaKey && !evt.altKey;
  const isNavigationOrDeletion = [
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 
    'Backspace', 'Delete', 'Enter', 'Tab', 
    'Home', 'End', 'PageUp', 'PageDown'
  ].includes(key);

  if (isPrintable || (!isNavigationOrDeletion && key && key.length === 1)) { 
    // Check if the current line contains an image span in the DOM
    const lineNode = rep.lines.atIndex(lineNumber);
    const lineElement = lineNode && lineNode.lineNode;
    const containsImage = lineElement && $(lineElement).find('span.image').length > 0;

    if (containsImage) {
      console.log('[ep_image_insert aceKeyEvent] Prevented typing on image line:', key);
      evt.preventDefault(); // Stop the original key press

      // Determine target line and position (start of next line)
      const targetLine = lineNumber + 1;
      const targetCol = 0;

      // Move cursor to the start of the next line
      editorInfo.ace_performSelectionChange([targetLine, targetCol], [targetLine, targetCol]);

      // Insert the character at the new position
      // Need to ensure this happens *after* selection change is processed
      // Using a minimal timeout often works for this kind of race condition
      setTimeout(() => {
        editorInfo.ace_replaceRange([targetLine, targetCol], [targetLine, targetCol], key);
      }, 0);

      return cb(true); // Event handled
    }
  }

  return cb(false); // Let Etherpad handle other keys normally
};
