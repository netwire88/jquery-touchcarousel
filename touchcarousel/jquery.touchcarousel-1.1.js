/*
 * TouchCarousel  v1.1
 *
 * Copyright 2011, Dmitry Semenov, http://dimsemenov.com
 * 
 */
(function($) {
	function TouchCarousel(element, options) {	
		this.carouselRoot = $(element);
		
		var self = this;			
		this._lockYAxis = false;
		this._isAnimating = false;		
		
		this._downEvent = "";
		this._moveEvent = "";
		this._upEvent = "";
		
		this._totalItemsWidth;
		this._itemWidths;
		
		this._startAccelerationX;
		this._accelerationX;
		this._latestDragX;
		
		this._startTime = 0;
		
		this.settings = $.extend({}, $.fn.touchCarousel.defaults, options);		
		
		this._dragContainer = this.carouselRoot.find(".touchcarousel-container");	
		
		// animate directly style for better performance
		this._dragContainerStyle = this._dragContainer[0].style;
		
		this._itemsWrapper = this._dragContainer.wrap($('<div class="touchcarousel-wrapper" />')).parent();		
		var itemsJQ = this._dragContainer.find(".touchcarousel-item");
		
		/* Array item structure: 
		 * {
		 * 		item: jQuery item object
		 * 		index: item index
		 * 		posX: item X position
		 *      width: item width
		 * }
		 * 
		 * */
		this.items = [];
		this.numItems = itemsJQ.length;
		
		
		
		this._decelerationAnim;
		this._successfullyDragged = false;
		this._startMouseX = 0;
		this._prevMouseX = 0;
		this._moveDist = 0;
		this._blockClickEvents = false;
		this._wasBlocked = false;
		
		this._useWebkitTransition = false;
		
		
		if('ontouchstart' in window) {
			this.hasTouch = true;
			this._downEvent = 'touchstart.rs';
			this._moveEvent = 'touchmove.rs';
			this._upEvent = 'touchend.rs';
			this._baseFriction = this.settings.baseTouchFriction;
		} else {
			this.hasTouch = false;
			this._baseFriction = this.settings.baseMouseFriction;
			if(this.settings.dragUsingMouse) {
				this._downEvent = 'mousedown.rs';
				this._moveEvent = 'mousemove.rs';
				this._upEvent = 'mouseup.rs';
				
				//setup cursor
				this._grabCursor;
				this._grabbingCursor;
				var ua = $.browser;
				if (ua.msie || ua.opera) {
					this._grabCursor = this._grabbingCursor = "move";
				} else if(ua.mozilla) {
					this._grabCursor = "-moz-grab";
					this._grabbingCursor = "-moz-grabbing";
				} 
				this._setGrabCursor();
			} else {
				// set cursor to auto if drag navigation is disabled
				this._itemsWrapper.addClass('auto-cursor');
			}
			
		}	
		if(this.hasTouch || this.settings.useWebkit3d) {
			// check if browser supports translate3d()
			if(('WebKitCSSMatrix' in window && 'm11' in new WebKitCSSMatrix())) {	
				this._dragContainer.css({'-webkit-transform-origin':'0 0', '-webkit-transform': 'translateZ(0)'});			
				this._useWebkitTransition = true;
			}
		}
		
		
		if(this._useWebkitTransition) {
			this._xProp = '-webkit-transform';
			this._xPref = 'translate3d(';
			this._xSuf = 'px, 0, 0)';
		} else {
			this._xProp = 'left';
			this._xPref = '';
			this._xSuf = 'px';
		}
		
		if(this.hasTouch) {
			this.settings.directionNavAutoHide = false;			
		}		
		
		if(!this.settings.directionNav) {
			if(this.settings.loopItems) {
				this._arrowLeftBlocked = true;
				this._arrowRightBlocked = true;
			} else {
				this._arrowLeftBlocked = false;
				this._arrowRightBlocked = false;
			}
			this.settings.loopItems = true;
		}
		
		var	itemObj,
			jqItem,
			dataSRC,
			slideImg,
			currPosX = 0;
		
		
		
		itemsJQ.eq(this.numItems - 1).addClass('last');
		
		// parse items
		itemsJQ.each(function(index) {
			jqItem = $(this);			
			itemObj = {};
			itemObj.item = jqItem;
			itemObj.index = index;
			itemObj.posX = currPosX;
			itemObj.width = (jqItem.outerWidth(true) || self.settings.itemFallbackWidth);			
			currPosX += itemObj.width;
			
			// block all links inside slides when dragging
			if(!this.hasTouch) {
				jqItem.find('a').bind('click.touchcarousel', function(e) {					
					if(self._successfullyDragged) {						
						e.preventDefault();						
						return false;
					}						
				});
			} else {
				// Fix preventing link bug on some touch devices
				var jqLinks = jqItem.find('a');
				var jqLink;
				jqLinks.each(function() {
					jqLink = $(this);
					jqLink.data('tc-href', jqLink.attr('href'));
					jqLink.data('tc-target', jqLink.attr('target'));
					jqLink.attr('href', '#');
					jqLink.bind('click', function(e) {							
						e.preventDefault();	
						if(self._successfullyDragged) {							
							return false;
						} else {
							var linkData = $(this).data('tc-href');							
							var linkTarget = $(this).data('tc-target');								
							if(!linkTarget || linkTarget.toLowerCase() === '_self') {
								window.location.href = linkData;
							} else {
								window.open(linkData);
							}							
						}					
					});
				});		
			}				
			
			// prevent dragging on all elements that have 'non-draggable' class			
			jqItem.find('.non-draggable').bind(self._downEvent, function(e) {					
				self._successfullyDragged = false;	
				e.stopImmediatePropagation();
			});
			
			self.items.push(itemObj);
		});
		
		
		this._maxXPos = this._totalItemsWidth = currPosX;		
		
		
		if(this.settings.itemsPerMove > 0) {
			this._itemsPerMove = this.settings.itemsPerMove;
		} else {
			this._itemsPerMove = 1;			
		}
		
		// Setup paging
		if(this.settings.pagingNav) {
			this.settings.snapToItems = true;
			this._pagingEnabled = true;
			this._numPages = Math.ceil(this.numItems / this._itemsPerMove);
			this._currPageId = 0;
			
			if(this.settings.pagingNavControls) {
				this._pagingNavContainer = $('<div class="tc-paging-container"><div class="tc-paging-centerer"><div class="tc-paging-centerer-inside"></div></div></div>');
				var pagingInside = this._pagingNavContainer.find('.tc-paging-centerer-inside');
				var pagingItem;
				
				for(var i = 1; i <= this._numPages; i++ ) {					
					pagingItem = $('<a class="tc-paging-item" href="#">' + i + '</a>').data('tc-id',i);					
					if(i === this._currPageId + 1) {
						pagingItem.addClass('current');
					}
					pagingInside.append(pagingItem);	
				}
			
				this._pagingItems = pagingInside.find(".tc-paging-item").click(function(e) {		
					e.preventDefault();						
					self.goTo(($(e.currentTarget).data('tc-id') - 1) * self._itemsPerMove);
				});
				
				this._itemsWrapper.after(this._pagingNavContainer);
			}
			
		} else {
			this._pagingEnabled = false;
		}

		
		this._dragContainer.css({
			width:currPosX
		});
		
		


		
		
	


		//Direction navigation (arrows)
		if(this.settings.directionNav) {	
			this._itemsWrapper.after("<a href='#' class='arrow-holder left'><span class='arrow-icon left'></span></a> <a href='#' class='arrow-holder right'><span class='arrow-icon right'></span></a>");
			this.arrowLeft = this.carouselRoot.find(".arrow-holder.left");
			this.arrowRight = this.carouselRoot.find(".arrow-holder.right");

			
			/*if(this.settings.loopItems) {
				this._arrowLeftBlocked = false;
				this._disableLeftArrow();
			}*/
			
			if(this.arrowLeft.length < 1 || this.arrowRight.length < 1) {
				this.settings.directionNav = false;
			} else if(this.settings.directionNavAutoHide) {
				this.arrowLeft.hide();
				this.arrowRight.hide();

				this.carouselRoot.one("mousemove.arrowshover",function() {
					self.arrowLeft.fadeIn("fast");
					self.arrowRight.fadeIn("fast");					
				});


				this.carouselRoot.hover(
						function() {
							self.arrowLeft.fadeIn("fast");
							self.arrowRight.fadeIn("fast");
						},
						function() {
							self.arrowLeft.fadeOut("fast");
							self.arrowRight.fadeOut("fast");				
						}
				);	
			}	
			
			
			this._updateDirectionNav(0);
			
			if(this.settings.directionNav) {
				this.arrowRight.click(function(e) {					
					e.preventDefault();	
					if(self.settings.loopItems && !self._blockClickEvents || !self._arrowRightBlocked )
						self.next();
				});

				this.arrowLeft.click(function(e) {
					e.preventDefault();
					if(self.settings.loopItems && !self._blockClickEvents || !self._arrowLeftBlocked )
						self.prev();
				});	
			}
		}

		
		

		// Manage window resize event with 100ms delay
		this.carouselWidth;
		this._resizeEvent = 'onorientationchange' in window ? 'orientationchange.touchcarousel' : 'resize.touchcarousel';
		var resizeTimer;
		$(window).bind(this._resizeEvent, function() {		
			if(resizeTimer) 
				clearTimeout(resizeTimer);			
			resizeTimer = setTimeout(function() { self.updateCarouselSize(false); }, 100);			
		});		
		
		
		// Setup scrollbar
		if(this.settings.scrollbar) {
			this._scrollbarHolder = $("<div class='scrollbar-holder'><div class='scrollbar"+ (this.settings.scrollbarTheme.toLowerCase() === "light" ? " light" : " dark")  +"'></div></div>");
			this._scrollbarHolder.appendTo(this.carouselRoot);
			this.scrollbarJQ = this._scrollbarHolder.find('.scrollbar');
			this._scrollbarHideTimeout = "";
			this._scrollbarStyle = this.scrollbarJQ[0].style;			
			this._scrollbarDist = 0;
			if(this.settings.scrollbarAutoHide) {
				this._scrollbarVisible = false;
				this.scrollbarJQ.css("opacity", 0);
			} else {
				this._scrollbarVisible = true;
			}
			
		} else {
			this.settings.scrollbarAutoHide = false;
		}
		
		
		this.updateCarouselSize(true);
		
		
		
		
		
		this._itemsWrapper.bind(this._downEvent, function(e) {  self._onDragStart(e); });	
		
		
		
		// Setup autoplay			
		if(this.settings.autoplay && this.settings.autoplayDelay > 0) {		
			this._isHovering = false;
			this.autoplayTimer = '';
			this.wasAutoplayRunning = true;
			
			if(!this.hasTouch) {						
				this.carouselRoot.hover(
						function() {						
							self._isHovering = true;							
							self._stopAutoplay();
						},
						function() {							
							self._isHovering = false;							
							self._resumeAutoplay();
						}
				);				
			}
			this.autoplay = true;	
			
			this._releaseAutoplay();
		} else {
			this.autoplay = false;
		}
		
		
		// Keyboard navigation
		if(this.settings.keyboardNav) {
			$(document).bind("keydown.touchcarousel", function(e) {
				if(!self._blockClickEvents) {
					if (e.keyCode === 37) {						
						self.prev();
					}
					else if (e.keyCode === 39) {						
						self.next();
					}
				}
			});
		}
		
		// release carousel main container overflow
		this.carouselRoot.css("overflow","visible");
		
	} /* TouchCarousel Constructor End */
	/* -------------------------------------TouchCarousel Prototype------------------------------------------------------*/
	
	
	
	TouchCarousel.prototype = {
			/* Public methods: */
			goTo:function(id, fromAutoplay) {
						
				
				var newItem = this.items[id];
				
				
				if(newItem) {					
					if(!fromAutoplay && this.autoplay && this.settings.autoplayStopAtAction) {						
						this.stopAutoplay();
					}
					
					this._updatePagingNav(id);
					
					
					this.endPos = this._getXPos();
					var newX = -newItem.posX;
					if(newX > 0) {
						newX = 0;
					} else if(newX < this.carouselWidth - this._maxXPos) {
						newX = this.carouselWidth - this._maxXPos;
					}
					this.animateTo(newX, this.settings.transitionSpeed, "easeInOutSine");					
				}			
				
			},
			next:function(fromAutoplay) {				
				var currXPos = this._getXPos();				
				var newItemId = this._getItemAtPos(currXPos).index;	
				
				
				if(!this._pagingEnabled) {
					newItemId = newItemId + this._itemsPerMove;						
					if(this.settings.loopItems) {
						if(currXPos <= this.carouselWidth - this._maxXPos) {
							newItemId = 0;
						}
					}
					if(newItemId > this.numItems - 1) {
						newItemId = this.numItems - 1;
					}
				} else {
					var newPageId = this._currPageId +  1;
					if(newPageId >  this._numPages - 1) {						
						if(this.settings.loopItems) {
							newItemId = 0;
						} else {
							newItemId = (this._numPages - 1) * this._itemsPerMove;	
						}
					} else {
						newItemId = newPageId * this._itemsPerMove;	
					}
				}
				
				
				
				this.goTo(newItemId, fromAutoplay);
			},
			prev:function(fromAutoplay) {	
				var currXPos = this._getXPos();				
				var newItemId = this._getItemAtPos(currXPos).index;	
				
				if(!this._pagingEnabled) {
					newItemId = newItemId - this._itemsPerMove;						
					if(newItemId < 0) {
						if(this.settings.loopItems) {
							if(currXPos < 0) {
								newItemId = 0;							
							} else {
								newItemId = this.numItems - 1;							
							}
							
						} else {
							newItemId = 0;
						}
					}	
				} else {
					var newPageId = this._currPageId -  1;
					if(newPageId <  0) {						
						if(this.settings.loopItems) {
							newItemId = (this._numPages - 1) * this._itemsPerMove;	
						} else {
							newItemId = 0;
						}
					} else {
						newItemId = newPageId * this._itemsPerMove;	
					}			
				}				
				this.goTo(newItemId, fromAutoplay);
			},
			getCurrentId:function() {
				var currId = this._getItemAtPos(this._getXPos()).index;
				return currId;
			},
			setXPos:function(pos, isScrollbar) {	
				if(!isScrollbar) {
					this._dragContainerStyle[this._xProp] = (this._xPref + pos + this._xSuf);					
				} else {					
					this._scrollbarStyle[this._xProp] = (this._xPref + pos + this._xSuf);
				}				
			},
			stopAutoplay: function() {				
				this._stopAutoplay();
				this.autoplay = false;
				this.wasAutoplayRunning = false;				
			},
			resumeAutoplay: function() {
				this.autoplay = true;
				if(!this.wasAutoplayRunning) {
					this._resumeAutoplay();
				}				
			},
			updateCarouselSize:function(leavePos) {
				var self = this;
				
				this.carouselWidth = this.carouselRoot.width();
				if(this.settings.scrollToLast) {
					var lastItemsWidth = 0;
					if(this._pagingEnabled) {					
						var freeItems = (this.numItems % this._itemsPerMove);
						if(freeItems > 0) {
							for(var i = this.numItems - freeItems; i < this.numItems; i++) {								
								lastItemsWidth += this.items[i].width;
							}
						} else {
							lastItemsWidth = this.carouselWidth;
						}
						
					} else {
						lastItemsWidth = this.items[this.numItems - 1].width;
					}
					this._maxXPos = this._totalItemsWidth + this.carouselWidth - lastItemsWidth;
				} else {
					
					this._maxXPos = this._totalItemsWidth;
				}
				
				
				if(this.settings.scrollbar) {
					var scrlWidth = Math.round(this._scrollbarHolder.width() / (this._maxXPos / this.carouselWidth));
					this.scrollbarJQ.css('width', scrlWidth);					
					this._scrollbarDist = this._scrollbarHolder.width() - scrlWidth;
				}		
				if(!this.settings.scrollToLast) {
					if(this.carouselWidth >= this._totalItemsWidth) {
						this._wasBlocked = true;						
						if(!this.settings.loopItems) {
							this._arrowRightBlocked = true;							
							this.arrowRight.addClass("disabled");	
							this._arrowLeftBlocked = true;
							this.arrowLeft.addClass("disabled");	
						}
						this.setXPos(0);						
						return;
					} else if(this._wasBlocked) {
						this._wasBlocked = false;
						this._arrowRightBlocked = false;	
						this._arrowLeftBlocked = false;
						this.arrowRight.removeClass("disabled");	
						this.arrowLeft.removeClass("disabled");	
					}					
				}
				
				if(!leavePos) {
					var newX = this.endPos = this._getXPos();		
					
					if(newX > 0) {
						newX = 0;
					} else if(newX < this.carouselWidth - this._maxXPos) {
						newX = this.carouselWidth - this._maxXPos;
					}
					this.animateTo(newX, 300, "easeInOutSine");		
				}
				
				
			},
			animateTo:function(pos, speed, easing, bounceAnim, endPos, bounceSpeed, bounceEasing) {		
				
				if(this.settings.onAnimStart !== null) {
					this.settings.onAnimStart.call(this);
				}
				
				
				if(this.autoplay && this.autoplayTimer) {		
					this.wasAutoplayRunning = true;
					this._stopAutoplay();
				}
				this._stopAnimation();
				
				var self = this;
				
				var scrollbarEnabled = this.settings.scrollbar,
					prop = self._xProp,
					pref = self._xPref,
					suf = self._xSuf,				
					from = {containerPos: this.endPos},
					to = {containerPos: pos},
					to2 = {containerPos: endPos},
					endPos = bounceAnim ? endPos : pos,
					dContainer = self._dragContainerStyle;
				
				self._isAnimating = true;
				
				if(scrollbarEnabled) {
					var sbStyle = this._scrollbarStyle;
					var sbAnimateDist = self._maxXPos - self.carouselWidth;
					if(this.settings.scrollbarAutoHide)  { 
						if(!this._scrollbarVisible) {
							this._showScrollbar();
						}
					}
				}
				
				
				
				this._updateDirectionNav(endPos);
				
				function animationComplete() {
					self._isAnimating = false;
			    	self._releaseAutoplay();
			    	if(self.settings.scrollbarAutoHide)  {					
			    		self._hideScrollbar();
					}
			    	
			    	if(self.settings.onAnimComplete !== null) {
						self.settings.onAnimComplete.call(self);
					}
				}
				
				
				
				
				this._decelerationAnim = $(from).animate(to, {
				    duration: speed,
				    easing: easing,
				    step: function() {
				    	if(scrollbarEnabled) {		
				    		sbStyle[prop] = (pref + Math.round((self._scrollbarDist) * (-this.containerPos / sbAnimateDist)) + suf );	  
				    	}
				    	dContainer[prop] = (pref + Math.round(this.containerPos) + suf);					       
				    }, 
				    complete: function() {
				    	if(bounceAnim) {
				    		self._decelerationAnim = $(to).animate(to2, {
							    duration: bounceSpeed,
							    easing: bounceEasing,
							    step: function() {			
							    	if(scrollbarEnabled) {
							    		sbStyle[prop] = (pref + Math.round((self._scrollbarDist) * (-this.containerPos / sbAnimateDist)) + suf );	  
							    	}
							    	dContainer[prop] = (pref + Math.round(this.containerPos) + suf);							        				       
							    },
							    complete: function() {							    	
							    	if(scrollbarEnabled) {
							    		sbStyle[prop] = (pref + Math.round((self._scrollbarDist) * (-to2.containerPos / sbAnimateDist)) + suf );	  
							    	}
							    	dContainer[prop] = (pref + Math.round(to2.containerPos) + suf);								    	
							    	animationComplete();
							    }
				    		});					    		
				    	} else {					    		
				    		if(scrollbarEnabled) {
					    		sbStyle[prop] = (pref + Math.round((self._scrollbarDist) * (-to.containerPos / sbAnimateDist)) + suf );	  					    	
				    		}
				    		dContainer[prop] = (pref + Math.round(to.containerPos) + suf);			    		
				    		animationComplete();				    		
				    	}
				    }
				});	
				
							
			},
			/* Destroy carousel and remove it's element */
			destroy: function() {
				this.stopAutoplay();
				this._itemsWrapper.unbind(this._downEvent);					
				$(document).unbind(this._moveEvent).unbind(this._upEvent);	
				$(window).unbind(this._resizeEvent);
				if(this.settings.keyboardNav) {
					$(document).unbind("keydown.touchcarousel");
				}	
				this.carouselRoot.remove();
			},
			
			
			/* Private methods: */
			_updatePagingNav:function(id) {
				if(this._pagingEnabled) {	
					var newPageId = this._getPageIdFromItemId(id);					
					this._currPageId = newPageId;	
					if(this.settings.pagingNavControls) {
						this._pagingItems.removeClass('current');
						this._pagingItems.eq(newPageId).addClass('current');
					}
					
				}
			},
			_getPageIdFromItemId:function(id) {
				var itemsPerPage = this._itemsPerMove;				
				for(var i = 0; i < this._numPages; i++) {	
					if(id >= i * itemsPerPage  && id < i * itemsPerPage + itemsPerPage) {								
						return i;						
					}					
				}
				if(id < 0) {
					return 0;
				} else if(id >= this._numPages) {
					return this._numPages - 1;
				}
				return false;
			},			
			_enableArrows:function() {
				if(!this.settings.loopItems) {
					if(this._arrowLeftBlocked) {								
						this._arrowLeftBlocked = false;
						this.arrowLeft.removeClass("disabled");				
					} else if(this._arrowRightBlocked) {								
						this._arrowRightBlocked = false;
						this.arrowRight.removeClass("disabled");		
					}
				}
			},
			
			
			_disableLeftArrow:function() {			
				if(!this._arrowLeftBlocked && !this.settings.loopItems) {		
			
					this._arrowLeftBlocked = true;
					this.arrowLeft.addClass("disabled");	
					if(this._arrowRightBlocked) {
						this._arrowRightBlocked = false;
						this.arrowRight.removeClass("disabled");
					}					
				}	
			},
			_disableRightArrow:function() {				
				if(!this._arrowRightBlocked && !this.settings.loopItems) {					
					this._arrowRightBlocked = true;							
					this.arrowRight.addClass("disabled");	
					if(this._arrowLeftBlocked) {
						this._arrowLeftBlocked = false;
						this.arrowLeft.removeClass("disabled");		
					}					
				}	
			},
			_getItemAtPos:function(pos) {
				var self = this;
				pos = -pos;
				
				
				var currItem;				
				for(var i = 0; i < self.numItems; i++) {					
					currItem = self.items[i];
					if(pos >= currItem.posX && pos < currItem.posX + currItem.width) {	
					
						return currItem;					
					}
				}
				return -1;
			},
			

			
			_releaseAutoplay:function() {
				if(this.autoplay) {
					if(this.wasAutoplayRunning) {		
						if(!this._isHovering) {
							this._resumeAutoplay();
						}						
						this.wasAutoplayRunning = false;						
					}
				}
			},
			_hideScrollbar:function() {
				var self = this;
				this._scrollbarVisible = false;
				if(this._scrollbarHideTimeout) {
					clearTimeout(this._scrollbarHideTimeout);
				}				
				this._scrollbarHideTimeout = setTimeout(function(){
					self.scrollbarJQ.animate({opacity:0}, 150, "linear");
				}, 450);
			},
			_showScrollbar:function() {
				this._scrollbarVisible = true;		
				if(this._scrollbarHideTimeout) {
					clearTimeout(this._scrollbarHideTimeout);
				}	
				this.scrollbarJQ.stop().animate({opacity:1}, 150, "linear");
			},
			_stopAnimation:function() {
				if(this._decelerationAnim) {
					this._decelerationAnim.stop();
				}				
			},			
			_resumeAutoplay: function() {
 				if(this.autoplay) {
 					var self = this;
 	 				if(!this.autoplayTimer) {
 	 					this.autoplayTimer = setInterval(function() { 
 	 						if(!self._isDragging && !self._isAnimating) {
 	 							self.next(true);
 	 						}						
 	 					}, this.settings.autoplayDelay);
 	 				}
 				}	
			},	
			_stopAutoplay: function() {
				if(this.autoplayTimer) {					
					clearInterval(this.autoplayTimer);
					this.autoplayTimer = '';
				}								
			},
			_getXPos:function(isScrollbar) {
				var obj = !isScrollbar ? this._dragContainer : this.scrollbarJQ;			
				
				if(!this._useWebkitTransition) {
					return Math.round(obj.position().left);	
				} else {						
					var transform = obj.css("-webkit-transform");
					var explodedMatrix = transform.replace(/^matrix\(/i, '').split(/, |\)$/g);
					return parseInt(explodedMatrix[4], 10);				
				}
			},		
			
			_onDragStart:function(e) {			
				if(!this._isDragging) {		
					
					if(this.autoplay && this.settings.autoplayStopAtAction) {
						this.stopAutoplay();
					}
					
					this._stopAnimation();
					if(this.settings.scrollbarAutoHide) {
						this._showScrollbar();
					}
					
					
					var point;
					if(this.hasTouch) {
						this._lockYAxis = false;
						//parsing touch event
						var currTouches = e.originalEvent.touches;
						if(currTouches && currTouches.length > 0) {
							point = currTouches[0];
						}					
						else {	
							return false;						
						}
					} else {
						point = e;						
						e.preventDefault();						
					}
					
					
					this._setGrabbingCursor();			
					this._isDragging = true;
					var self = this;
					if(this._useWebkitTransition) {
						self._dragContainer.css({'-webkit-transition-duration':'0', '-webkit-transition-property': 'none'});
					}
					$(document).bind(this._moveEvent, function(e) { self._onDragMove(e); });
					$(document).bind(this._upEvent, function(e) { self._onDragRelease(e); });		

				
					this._startPos = this._getXPos();
					
								
					
					this._accelerationX = point.clientX;
					
					
					this._successfullyDragged = false;
					
					this._startTime = (e.timeStamp || (new Date().getTime()));
					
					this._moveDist = 0;
					this._prevMouseX = this._startMouseX = point.clientX;
					this._startMouseY = point.clientY;
				}
			},
			_onDragMove:function(e) {
				var timeStamp = (e.timeStamp || (new Date().getTime()));
				var point;
				if(this.hasTouch) {
					if(this._lockYAxis) {
						return false;
					}				
					
					var touches = e.originalEvent.touches;
					// If touches more then one, so stop sliding and allow browser do default action
					
					if(touches.length > 1) {
						return false;
					}
					
					point = touches[0];	
					// If drag direction on mobile is vertical, so stop sliding and allow browser to scroll				
					if(Math.abs(point.clientY - this._startMouseY) > Math.abs(point.clientX - this._startMouseX) + 3) {
						if(this.settings.lockAxis) {
							this._lockYAxis = true;
						}						
						return false;
					}
				
					e.preventDefault();			
				} else {
					point = e;
					e.preventDefault();		
				}
				
				this._latestDragX = point.clientX;

				// Helps find last direction of drag move
				this._lastDragPosition = this._currentDragPosition;
				var distance = point.clientX - this._prevMouseX;
				if(this._lastDragPosition != distance) {
					this._currentDragPosition = distance;
				}
				
				if(distance != 0)
				{
					
					var dist = this._startPos + this._moveDist;
					
					
					
					if(dist >= 0) {						
						distance = distance / 4;						
						this._disableLeftArrow();
						
					} else if(dist <= this.carouselWidth - this._maxXPos) {	
						this._disableRightArrow();
						distance = distance / 4;
					} else {						
						this._enableArrows();
					}
					
					this._moveDist += distance;
					this.setXPos(dist);				
					
					if(this.settings.scrollbar) {					
						this.setXPos((this._scrollbarDist) * (-dist / (this._maxXPos - this.carouselWidth)), true);
					}
				}		
				
				
				
				
				
				
				this._prevMouseX = point.clientX;
			
				if (timeStamp - this._startTime > 350) {
					this._startTime = timeStamp;
					this._accelerationX = point.clientX;						
				}
				
				if(this.settings.onDragStart !== null) {
					this.settings.onDragStart.call(this);
				}
				
				return false;		
			},
			
			_onDragRelease:function(e) {
				
			
				
				if(this._isDragging) {		
					
					var self = this;
					this._isDragging = false;			
					this._setGrabCursor();
					
				
					
					
					
					this.endPos = this._getXPos();
					
					
					this.isdrag = false;

					$(document).unbind(this._moveEvent).unbind(this._upEvent);					

					if(this.endPos == this._startPos) {						
						this._successfullyDragged = false;
						if(this.settings.scrollbarAutoHide) {
							this._hideScrollbar();
						}
						return;	
					} else {
						this._successfullyDragged = true;
					}
					
					//function animate
					var dist = (this._latestDragX - this._accelerationX);		
					var duration =  Math.max(40, (e.timeStamp || (new Date().getTime())) - this._startTime);
					
					
					
					// For nav speed calculation F=ma :)
					var friction = 0.5,
					    mass = 2,					
						v0 = Math.abs(dist) / duration;	
					
					function getCorrectXPos(pos) {
						
						if(pos > 0) {
							pos = 0;
						} else if(pos < self.carouselWidth - self._maxXPos) {
							pos = self.carouselWidth - self._maxXPos;
						}	
						return pos;
					}
					
					if(!this.settings.snapToItems) {
						// Physics continue
						var timeOffset = 0;
						if(v0 <= 2) {
							friction = this._baseFriction * 3.5;
							timeOffset = 0;
						} else if(v0 > 2 && v0 <= 3) {
							friction = this._baseFriction * 4;
							timeOffset = 200;
						} else if(v0 > 3){
							timeOffset = 300;
							if(v0 > 4) {
								v0 = 4;
								timeOffset = 400;
								friction = this._baseFriction * 6;
							}
							friction = this._baseFriction * 5;
						}							
						
						var S = (v0 * v0 * mass) / (2 * friction);
						S = S * (dist < 0 ? -1 : 1);					
						var t = v0 * mass / friction + timeOffset;	
							
						
						if(this.endPos + S > 0) {	
							if(this.endPos > 0) {
								this.animateTo(0, 800, "easeOutCubic");							
							} else {
								this.animateTo(
										(this.carouselWidth / 10) * ((timeOffset + 200) / 1000), 
										(Math.abs(this.endPos) * 1.1) / v0, 
										"easeOutSine", 
										true, 
										0, 
										400, 
										"easeOutCubic");					
							}
						} else if(this.endPos + S < this.carouselWidth - this._maxXPos) {	
							if(this.endPos < this.carouselWidth - this._maxXPos) {						
								this.animateTo(this.carouselWidth - this._maxXPos, 800, "easeOutCubic");							
							} else {							
								this.animateTo(
										this.carouselWidth - this._maxXPos - (this.carouselWidth / 10) * ((timeOffset + 200) / 1000), 
										(Math.abs(this.carouselWidth - this._maxXPos - this.endPos) * 1.1) / v0, 
										"easeOutSine", 
										true, 
										this.carouselWidth - this._maxXPos, 
										400, 
										"easeOutCubic");	
							}	
						} else {				
							this.animateTo(this.endPos + S, t, "easeOutCubic");
						}		
					} else {						
						if(this.autoplay && this.settings.autoplayStopAtAction) {
							this.stopAutoplay();
						}
						var isNext = Boolean(this._startMouseX - this._prevMouseX > 0);
										
						
						var newX = getCorrectXPos(this._getXPos());
						
											
						var newItemId = this._getItemAtPos(newX).index;						
						
						if(!this._pagingEnabled) {
							newItemId = newItemId + (isNext ?  this._itemsPerMove : ( - this._itemsPerMove + 1));									
						} else {	
							if(isNext) {			
								newX = Math.max(newX - this.carouselWidth - 1, 1 - self._maxXPos);	
								newItemId = this._getItemAtPos(newX).index;
								if(newItemId === undefined) {
									newItemId = this.numItems - 1;
								}
							}							
							
							var newPageId = this._getPageIdFromItemId(newItemId);
														
							newItemId = newPageId * this._itemsPerMove;								
						}
						
						if(isNext) {							
							newItemId = Math.min(newItemId, this.numItems - 1);
						} else {							
							newItemId = Math.max(newItemId, 0);
						}
						
											
						
						var newItem = this.items[newItemId];
					
						this._updatePagingNav(newItemId);
						
						if(newItem) {
							
							newX = getCorrectXPos(-newItem.posX);
							
							var newDist = Math.abs(this.endPos  - newX);
							var newDuration = Math.max((newDist * 1.08) / v0, 150);
							var isFast = Boolean(newDuration < 180);
							var addDist = newDist * 0.08;
							if(isNext) {
								addDist = addDist * -1;
							}
							
							
							this.animateTo(isFast ? (newX + addDist ) : newX,
									Math.min(newDuration, 400),
									"easeOutSine",
									isFast,
									newX,
									300,
									"easeOutCubic");	
							
							
						}
					
					}
					
					if(this.settings.onDragRelease !== null) {
						this.settings.onDragRelease.call(this);
					}
					
				}

				return false;
			},
			_updateDirectionNav:function(pos) {				
				if(pos === undefined) {					
					pos = this._getXPos();
				}				
				if(!this.settings.loopItems) {
					if(pos >= 0) {						
						this._disableLeftArrow();
					} else if(pos <= this.carouselWidth - this._maxXPos) {
						this._disableRightArrow();						
					} else {
						this._enableArrows();
					}
				}
			},
			_setGrabCursor:function() {			
				if(this._grabCursor) {
					this._itemsWrapper.css('cursor', this._grabCursor);
				} else {
					this._itemsWrapper.removeClass('grabbing-cursor');
					this._itemsWrapper.addClass('grab-cursor');	
				}
							
			},
			_setGrabbingCursor:function() {		
				if(this._grabbingCursor) {
					this._itemsWrapper.css('cursor', this._grabbingCursor);
				} else {
					this._itemsWrapper.removeClass('grab-cursor');
					this._itemsWrapper.addClass('grabbing-cursor');	
				}				
			}
	}; /* TouchCarousel.prototype end */

	$.fn.touchCarousel = function(options) {    	
		return this.each(function(){
			var touchCarousel = new TouchCarousel($(this), options);
			$(this).data("touchCarousel", touchCarousel);
		});
	};

	$.fn.touchCarousel.defaults = {  
			itemsPerMove: 1,              // The number of items to move per arrow click.
			
			snapToItems: false,           // Snaps to items, based on itemsPerMove
			pagingNav: false,             // Enable paging nav (snaps to first item of every group, based on itemsPerMove). Overrides snapToItems
			pagingNavControls: true,      // Paging controls (bullets)
			
			
			
			autoplay:false,               // Autoplay enabled          
			autoplayDelay:3000,	          // Delay between transitions	
			autoplayStopAtAction:true,    // Stop autoplay forever when user clicks arrow or does any other action
			
			scrollbar: true,              // Scrollbar enabled
			scrollbarAutoHide: false,     // Scrollbar autohide
			scrollbarTheme: "dark",	      // Scrollbar color. Can be "light" or "dark"	
			
			transitionSpeed: 600,         // Carousel transition speed (next/prev arrows, autoplay)		
			
			directionNav:true,            // Direction (arrow) navigation (true or false)
			directionNavAutoHide:false,   // Direction (arrow) navigation auto hide on hover. (On touch devices arrows are always shown)
			
			loopItems: false,             // Loop items (don't disable arrows on last slide and allow autoplay to loop)
			
			keyboardNav: false,			  // Keyboard arrows navigation
			dragUsingMouse:true,          // Enable drag using mouse	
			
			
			scrollToLast: false,          // Last item ends at start of carousel wrapper	
			

			itemFallbackWidth: 500,       // Default width of the item in pixels. (used if impossible to get item width).
			
			baseMouseFriction: 0.0012,    // Container friction on desktop (higher friction - slower speed)
			baseTouchFriction: 0.0008,    // Container friction on mobile
			lockAxis: true,               // Allow dragging only on one direction
			useWebkit3d: false,           // Enable WebKit 3d transform on desktop devices 
                                          // (on touch devices this option is turned on)
										  // Use it if you have only images, 3d transform makes text blurry
			                                       
			
			onAnimStart: null,            // Callback, triggers before deceleration or transition animation
			onAnimComplete: null,         // Callback, triggers after deceleration or transition animation

			onDragStart:null,             // Callback, triggers on drag start
			onDragRelease: null           // Callback, triggers on drag complete
	};
	
	$.fn.touchCarousel.settings = {};
	
	/* easing types */
	$.extend(jQuery.easing, {
		easeInOutSine: function (x, t, b, c, d) {
			return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
		},
		easeOutSine: function (x, t, b, c, d) {
			return c * Math.sin(t/d * (Math.PI/2)) + b;
		},
		easeOutCubic: function (x, t, b, c, d) {
			return c*((t=t/d-1)*t*t + 1) + b;
		}
	});
	
})(jQuery);
