/*
** TrelloScrum v0.56 - https://github.com/Q42/TrelloScrum
** Adds Scrum to your Trello
**
** Original:
** Jasper Kaizer <https://github.com/jkaizer>
** Marcel Duin <https://github.com/marcelduin>
**
** Contribs:
** Paul Lofte <https://github.com/paullofte>
** Nic Pottier <https://github.com/nicpottier>
** Bastiaan Terhorst <https://github.com/bastiaanterhorst>
** Morgan Craft <https://github.com/mgan59>
** Frank Geerlings <https://github.com/frankgeerlings>
**
*/

//default story point picker sequence
var _pointSeq = ['?', 0, 0.1, 0.25, 0.5, 1, 2, 3, 5];
//attributes representing points values for card
var _pointsAttr = ['cpoints', 'points'];
var TrelloHelper;



//https://api.trello.com/1/boards/4eda297c53a776a00a443187/cards/21/?fields=name&key=120a6992c5396f169be49006bcc5da00&token=d286d39f7787999171b76871542cd76ce95c52e7ed8d8348dce17c25c333f84b
//internals
var filtered = false, //watch for filtered cards
	reg = /[\(](\x3f|\d*\.?\d+)([\)])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by ()
	regC = /[\[](\x3f|\d*\.?\d+)([\]])\s?/m, //parse regexp- accepts digits, decimals and '?', surrounded by []
	iconUrl = chrome.extension.getURL('images/storypoints-icon.png'),
	pointsDoneUrl = chrome.extension.getURL('images/points-done.png');

//what to do when DOM loads
$(function(){
	TrelloHelper = new Helper(document, $);
	

	//watch filtering
	$('.js-filter-toggle').live('mouseup',function(e){
		setTimeout(function(){
			filtered=$('.js-filter-cards').hasClass('is-on');
			Utils.calcPoints()
		})
	});
	new Cards(document, jQuery);
	
	
	// $("body").on('DOMNodeInserted', '.list-card-members .member .member-avatar', function(){
	// 	console.log(this);
	// });


	// if (window == top) {
	//   window.addEventListener("keyup", keyListener, false);
	// }

	// // // Keyboard keyup listener callback.
	// function keyListener(e) {
	// 	switch (e.keyCode){
	// 		case 32: 
	// 			setTimeout(function(){console.log($('.active-card')[0])}, 5000);
	// 			break;
	// 	}
	// }

	// $('body').bind('DOMSubtreeModified',function(e){
	// 	if($(e.target).hasClass('list')){
	// 		readList($(e.target));
	// 		computeTotal();
	// 	}
	// });

	$('.js-share').live('mouseup',function(){
		setTimeout(Utils.checkExport)
	});

	(function read(){
		Utils.readList($('.list'));
		Utils.computeTotal();
		$('body').one('DOMNodeInserted', '.list',$.debounce(read, 250));	
	})();
});

//.list pseudo
function List(el){
	if(el.list)return;
	el.list=this;

	var $list=$(el),
		busy = false,
		to,
		to2;

	var $total=$('<span class="list-total">').bind('DOMNodeRemovedFromDocument',function(){
				clearTimeout(to);
				to=setTimeout(function(){
					$total.appendTo($list.find('.list-header h2'))
				})
			}).appendTo($list.find('.list-header h2'));

	$list.bind('DOMNodeInserted',function(e){
		if($(e.target).hasClass('list-card') && !e.target.listCard) {
			clearTimeout(to2);
			to2=setTimeout(readCard,0,$(e.target))
		}
	});


	function readCard($c){
		$c.each(function(){
			var that=this,
					 to2,
					 busy=false;
			if($(that).hasClass('placeholder')) return;
			if(!that.listCard){
				for (var i in _pointsAttr){
					new ListCard(that, _pointsAttr[i])
				}
				that.updateDisplay();

				$(that).on('DOMNodeInserted','.list-card-title', function(e){
					if (busy){return;}
					//when list-card-title is changed, we get in this too many times, causes flickering
					if(($(e.target).hasClass('list-card-title'))) {// || e.target==that)) {
						clearTimeout(to2);
						to2=setTimeout(function(){
							busy=true;
							for (var i in _pointsAttr){
								that.listCard[_pointsAttr[i]].refresh();
							}
							that.updateDisplay();
							busy=false;
						}, 250);
					}
				});
			} 
		})
	};

	//this method takes time to run
	this.calc = function(){
		// $total.empty();
		var countHTML = "";
		for (var i in _pointsAttr){
			var score=0;
			var attr = _pointsAttr[i];
			$list.find('.list-card').each(function(){
				if(this.listCard && !isNaN(Number(this.listCard[attr].points)))
					score+=Number(this.listCard[attr].points)
			});
			var scoreTruncated = Utils.roundValue(score);	
			//when moving card, we sometimes add too many times the count		
			countHTML+='<span class="'+attr+'">'+(scoreTruncated>0?scoreTruncated:'')+'</span>';
		}
		$total.html(countHTML);
	};

	readCard($list.find('.list-card'));
	this.calc();
};

//.list-card pseudo
function ListCard(el, identifier){
	if(el.listCard && el.listCard[identifier]) return;
	//lazily create object
	if (!el.listCard){
		el.listCard={};
	}
	el.listCard[identifier]=this;

	var points=-1,
		consumed=identifier!=='points',
		regexp=consumed?regC:reg,
		parsed,
		that=this,
		busy=false,
		to,
		ptitle,
		$card=$(el),
		$badge=$('<div class="badge badge-points point-count '+identifier+'" style="background-image: url('+iconUrl+')"/>');

	if (!el.updateDisplay){
		el.updateDisplay = function(){
			var $title=$card.find('a.list-card-title');
			if(!$title[0])return;	
			$title[0].textContent = el.listCard['title'];
			delete(el.listCard['title']);
			//clean the attribute to allow next round
		}
	}

	this.refresh=function(){
		var $title=$card.find('a.list-card-title');
		if(!$title[0])return;
		if ($card.find('.badge.badge-points.'+identifier).length == 0){
			$badge.prependTo($card.find('.badges'));			
		}
		var title=el.listCard['title'] || $title[0].text;
		parsed=title.match(regexp);
		points=parsed?parsed[1]:-1;
		if($card.parent()[0]){
			el.listCard['title'] = title.replace(regexp, '');
			$badge.text(that.points);
			consumed?$badge.addClass("consumed"):$badge.removeClass('consumed');
			$badge.attr({title: 'This card has '+that.points+ (consumed?' consumed':'')+' storypoint' + (that.points == 1 ? '.' : 's.')})
		}
	};

	this.__defineGetter__('points',function(){
		//don't add to total when filtered out
		return parsed&&(!filtered||($card.css('opacity')==1 && $card.css('display')!='none'))?points:''
	});

	this.refresh();
};


function Helper(_document, jQuery){
	var key = "key=120a6992c5396f169be49006bcc5da00"; 
	var token;
	var trelloApi = "https://api.trello.com/1/";

	var $ = jQuery;
	var $status = $("<div id='TrelloScrum' class='off'>");
	$(_document.body).append($status);
	//flag as done
	var setAuthenticated = function(){
		token = Trello.token();
		$status.removeClass('off').addClass('on');
	};
	
	//action on click
	var onClickAuthenticate = function(){
		if (!Trello.authorized()){			
			Trello.authorize({
					name: 'TrelloScrum',
					expiration : 'never',
					scope : {
						read:true,
						write:true
					},
		 			type: "popup", 
		 			success : setAuthenticated
			});
		}else{
	 		Trello.deauthorize();
	 		$status.addClass('off').removeClass('on');
		}
		
	}
	$status.bind('click', onClickAuthenticate);
	//reauthenticate on page show
	Trello.authorize({
		interactive : false,
		success : setAuthenticated
	});	

	var buildSuffix = function(){
		return key+"&token="+token;
	}

	return {
		ready : Trello.authorized,
		trelloApi : "https://api.trello.com/1/",
		urlSuffix : buildSuffix

	};
};

function Cards(_document, jQuery){
	var $ = jQuery;
	//the story point picker
	function showPointPicker() {
		//could be improved using the api call
		if($(this).find('.picker').length) return;
		var $picker = $('<div class="picker">').appendTo('.card-detail-title .edit-controls');
		for (var i in _pointSeq) $picker.append($('<span class="point-value">').text(_pointSeq[i]).click(function(){
			var value = $(this).text();
			var $text = $('.card-detail-title .edit textarea');
			var text = $text.val();

			// replace our new
			$text[0].value=text.match(reg)?text.replace(reg, '('+value+') '):'('+value+') ' + text;

			// then click our button so it all gets saved away
			$(".card-detail-title .edit .js-save-edit").click();

			return false
		}))
	};

	function showDoneButton(){
		function checkIfDone(){
			var text = $('.card-detail-title.editable .window-title-text').text();
			var match = text.match(regC);
			if (match){
				$(".js-points-done").addClass('is-on');
			}else{
				$(".js-points-done").removeClass('is-on');
			}
		};
		//allows to refresh check state on DOMNodeInserted event
		checkIfDone();
		if (!TrelloHelper.ready() || $(this).find('.js-points-done-sidebar-button').length) return;
		var $btn = $('<div class="js-points-done-sidebar-button">'+
						'<a class="button-link js-points-done"><span class="app-icon small-icon points-done-icon" style="background-image: url('+pointsDoneUrl+')"></span> Done '+
							'<span class="on">'+
								'<span class="app-icon small-icon light check-icon"></span>'+
							 '</span> '+
						'</a> '+
					  '</div>').prependTo('.window-module.other-actions.clearfix div.clearfix');
		
		$btn.on('click', function(){
			//TODO plugin api authentication confirmation
			var currentURL = window.location.href;
			var lastSlash =  currentURL.lastIndexOf("/");
			var cardId = currentURL.substring(lastSlash+1);
			var boardId = currentURL.substring(currentURL.lastIndexOf("/", lastSlash-1)+1, lastSlash);
			$.ajax({
				url: TrelloHelper.trelloApi + 'boards/'+boardId+'/cards/'+cardId+'/?fields=name&'+TrelloHelper.urlSuffix(),
				success: function(d){				
					var text = d['name'];

					var $jsbtn = $(".js-points-done");
					var match;
					var flaggedAsDone = false;
					if ($jsbtn.hasClass('is-on')){
						match = text.match(regC);
						if (match){
							text = text.replace(regC, '('+match[1]+') ');
						}	
					}else{
						match = text.match(reg);
						if (match){
							text = text.replace(reg, '['+match[1]+'] ');
							flaggedAsDone = true;
						}
					}	
					
					var apiToCall = TrelloHelper.trelloApi + 'cards/'+d['id']+'/?name='+text+'&'+TrelloHelper.urlSuffix();
					if (flaggedAsDone){
						apiToCall+="&pos=bottom";
					}else{
						apiToCall+="&pos=top";
					}
					$.ajax({
						url: apiToCall,
						success: function(d1){
							$jsbtn.addClass('is-on', flaggedAsDone);
							if (flaggedAsDone){
								//can't access simple events via 'click()' so we manually close via faking a click
								var evt = document.createEvent('MouseEvents');
								evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
								$(".js-close-window")[0].dispatchEvent(evt);
							}
						},
						error: function(e){
							console.err(e);
						},
						type:'put'

					})
				}
			})

			return false;
		});
	}

	//for storypoint picker
	$(".card-detail-title .edit-controls").live('DOMNodeInserted',showPointPicker);
	//for done button
	$(_document).on('DOMNodeInserted','.window', showDoneButton);
};

var Utils = (function(){
//for export
	var $excel_btn,$excel_dl;
	window.URL = window.webkitURL || window.URL;
	window.BlobBuilder = window.BlobBuilder || window.WebKitBlobBuilder || window.MozBlobBuilder;


	function showExcelExport() {
		$excel_btn.text('Generating...');

		$.getJSON($('form').find('.js-export-json').attr('href'), function(data) {
			var s = '<table id="export" border=1>';
			s += '<tr><th>Points</th><th>Story</th><th>Description</th></tr>';
			$.each(data['lists'], function(key, list) {
				var list_id = list["id"];
				s += '<tr><th colspan="3">' + list['name'] + '</th></tr>';

				$.each(data["cards"], function(key, card) {
					if (card["idList"] == list_id) {
						var title = card["name"];
						var parsed = title.match(reg);
						var points = parsed?parsed[1]:'';
						title = title.replace(reg,'');
						s += '<tr><td>'+ points + '</td><td>' + title + '</td><td>' + card["desc"] + '</td></tr>';
					}
				});
				s += '<tr><td colspan=3></td></tr>';
			});
			s += '</table>';

			var bb = new BlobBuilder();
			bb.append(s);
			
			var board_title_reg = /.*\/board\/(.*)\//;
			var board_title_parsed = document.location.href.match(board_title_reg);
			var board_title = board_title_parsed[1];

			$excel_btn
				.text('Excel')
				.after(
					$excel_dl=$('<a>')
						.attr({
							download: board_title + '.xls',
							href: window.URL.createObjectURL(bb.getBlob('application/ms-excel'))
						})
				);

			var evt = document.createEvent('MouseEvents');
			evt.initMouseEvent('click', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
			$excel_dl[0].dispatchEvent(evt);
			$excel_dl.remove()
		});
		return false;
	};


	function _roundValue(_val){
		return (Math.floor(_val * 100) / 100);
	}

	//forcibly calculate list totals
	function _calcPoints($el){
		($el||$('.list')).each(function(){if(this.list)this.list.calc()})
	};


	function _checkExport() {
		if($('form').find('.js-export-excel').length) return;
		var $js_btn = $('form').find('.js-export-json');
		if($js_btn.length)
			$excel_btn = $('<a>')
				.attr({
					style: 'margin: 0 4px 4px 0;',
					class: 'button js-export-excel',
					href: '#',
					target: '_blank',
					title: 'Open downloaded file with Excel'
				})
				.text('Excel')
				.click(showExcelExport)
				.insertAfter($js_btn);
	}

	function _computeTotal(){
		var $title = $(".board-title");
		var $total = $(".board-title .list-total");
		if ($total.length == 0){
			$total = $("<span class='list-total'>").appendTo($title);
		}
		for (var i in _pointsAttr){
			var score = 0;
			var attr = _pointsAttr[i];
			$("#board .list-total ."+attr).each(function(){ 
				var value = $(this).text();
				if (value && !isNaN(value)){
					score+=parseFloat(value);
				} 
			});
			var $countElem = $('.board-title .list-total .'+attr);
			if ($countElem.length > 0){
				$countElem.remove();
			}
			$total.append("<span class='"+attr+"'>"+Utils.roundValue(score)+"</span>");
		}
	}

	function _readList($c){
		$c.each(function(){
			if(!this.list) new List(this);
			else if(this.list.calc) this.list.calc();
		})
	};

	return {
		roundValue : _roundValue,
		calcPoints : _calcPoints,
		checkExport : _checkExport,
		computeTotal: _computeTotal,
		readList : _readList
	}
})();

