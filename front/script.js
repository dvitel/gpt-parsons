var service = "/api/student"
var studentId = -1;
var puzzleId = -1;
var sessionId = "";
var events = [];
var attemptId = 0;
var shfl = [];
var sessionStartTimeStamp = new Date().getTime();
var correctlySolved = 0;

$(function () {
    var windowEvent = null;
    $(window).blur(function () {
        windowEvent =
            { timestamp: (new Date().getTime() - sessionStartTimeStamp), type:"inactive" }
    });                
    $(window).focus(function () {
        if (windowEvent !== null)
        {
            windowEvent.durationMs = (new Date().getTime() - sessionStartTimeStamp) - windowEvent.timestamp;
            windowEvent.sessionId = sessionId;
            if (windowEvent.type == "inactive") {
                puzzleInactivity += windowEvent.durationMs;
            }
            events.push(windowEvent);
            windowEvent = null;
        }
    });
    var loginContent = $(".loginContent");
    var puzzleContent = $(".puzzleContent");
    // var statsContent = $(".statsContent");
    var puzzleTitle = $("#puzzleTitle");
    var puzzleDesc = $("#puzzleDesc");
    var taskPane = $("#taskPane");
    var trash = $("#trashedList");
    var trashed = $("#trashed");
    var userName = $("#userName");
    var msg = $("#message");
    var wrongMsg = $("#wrongMsg");
    var hasBug = $("#hasBug");                
    var correctMsg = $("#correctMsg");
    var giveUpMsg = $("#giveUpMsg");
    var hintOk= $("#hintOk");
    //var trashFragment = $("#trashFragment");
    //var sortableIn = 1;
    var moveCount = 0;
    var hintCount = 0;
    var attemptCount = 0;
    var puzzleStartTime;
    var puzzleInactivity;
    var dragEvent = null;
    function createDragEvent(ui, startedIn) {
        var pos = ui.item.data("data-pos");
        var res = 
            { timestamp: (new Date().getTime() - sessionStartTimeStamp),
                type: "drag",
                fragment: 
                    {
                        type: ((pos === -1) ? "distractor" : "fragment"),
                        id: ((pos === -1) ? ui.item.data("data-d-id") : pos)
                    },
                startPosition: ui.item.index(),
                startedIn: startedIn,
                endedIn: "",
                durationMs: 0,
                moveIndex: moveCount
            };
        return res;
    }
    function dragStop(event, ui) {
        var parentId = ui.item.parent().attr("id");
        dragEvent.durationMs = (new Date().getTime() - sessionStartTimeStamp) - dragEvent.timestamp;
        dragEvent.stopPosition = ui.item.index();
        dragEvent.endedIn = (parentId == "taskPane") ? "answer" : "trash";
        dragEvent.sessionId = sessionId;
        events.push(dragEvent);                                                
        if ((dragEvent.startedIn !== dragEvent.endedIn) 
            || ((dragEvent.startPosition !== dragEvent.stopPosition) 
                && (dragEvent.endedIn == "answer"))) moveCount++;
        dragEvent = null;
        ui.item.removeClass("inAction");
        autoIndent();
        if (trash.find(".fragment").length == 0) trashed.fadeOut();
    }                
    taskPane.sortable({
        connectWith: "#trashedList",
        forcePlaceholderSize: true,
        forceHelperSize: true,
        opacity: 0.7,       
        revert: true,        
        cancel: ".trashIconHolder",
        handle: ".handIconHolder",
        scrollSensitivity: 10,
        scrollSpeed: 10,     
        start: function (event, ui) {                        
            ui.item.addClass("inAction");       
            ui.item.removeClass("hint");
            dragEvent = createDragEvent(ui, "answer");
        },
        stop: dragStop
    });          
    trash.sortable({
        forcePlaceholderSize: true,
        connectWith: "#taskPane",
        forceHelperSize: true,
        opacity: 0.7,         
        revert: true,
        cancel: ".trashIconHolder",
        handle: ".handIconHolder",
        scrollSensitivity: 10,
        scrollSpeed: 10,       
        start: function (event, ui) {
            ui.item.addClass("inAction");
            ui.item.removeClass("hint");
            dragEvent = createDragEvent(ui, "trash");
        },                    
        stop: dragStop                                   
    });        
    function autoIndent() {
        var indent = 0;
        var prevLine = null;
        taskPane.find(".fragment").each(function () {
            var frgmnt = $(this);
            var minIndent = indent;
            $(this).find(".indent").each(function () {
                var text = $(this).data("data-orig");
                var ind = 0;
                if ((prevLine != null) && 
                    (/^if\s*?\(.*?\)\s*?$/.test(prevLine) ||
                     /^while\s*?\(.*?\)\s*?$/.test(prevLine))
                     && !text.startsWith("{"))
                    ind = 1;
                // if (!text.startsWith("}"))
                //     $(this).animate({"padding-left": 15 * (indent + ind)}, 'slow');                            
                var textChars = text.split("");
                var closedBraces = 0;
                var localIndent = 0;
                for (var i = 0; i < textChars.length; i++){
                    if (textChars[i] === "{") 
                    {
                        localIndent++;
                    }
                    else if (textChars[i] === "}"){
                        localIndent--;
                        if (i == 0) closedBraces++;
                    }
                }
                var curIndent = Math.max(0, indent - closedBraces);
                $(this).data("indent", curIndent);
                //$(this).animate({"padding-left": 15 * Math.max(0, indent - closedBraces)}, 'slow'); 
                indent = Math.max(0, indent + localIndent);
                minIndent = Math.min(minIndent, curIndent);
                prevLine = text;
            });
            // frgmnt.animate({"margin-left": 15 * minIndent}, 'fast',
            //     function ()
            //     {
            //         $(this).find(".indent").each(function () {
            //             var curIndent = $(this).data("indent") - minIndent;
            //             $(this).animate({"padding-left": 15 * curIndent}, 'fast'); 
            //         });
            //     });
            $(this).find(".indent").each(function () {
                var curIndent = $(this).data("indent");
                $(this).animate({"padding-left": 15 * curIndent}, 'fast'); 
            });
        });
    }                
    // trashFragment.click(function () {                    
    //     var li = $(this).closest("li");
    //     li.fadeOut(function () {
    //         trashFragment.appendTo("body");     
    //         li.appendTo(trash);
    //         autoIndent();
    //         li.fadeIn();
    //         trashed.fadeIn();
    //     });                                                 fa-hand                                              
    // });
    var hoverEvent = null;
    function attachHover(fragment) {         
        /*          
        fragment.click(function () {
            if ($(this).is(".inAction") || $(this).is(":only-child")) {
                $(this).removeClass("inAction");
                $(this).find(".handIconHolder,.trashIconHolder").hide();
            } else 
            { 
                //taskPane.find(".inAction").removeClass("inAction");
                //trash.find(".inAction").removeClass("inAction");
                //$(this).addClass("inAction");
                //taskPane.find(".handIconHolder,.trashIconHolder").each(function () { $(this).hide(); });
                //trash.find(".handIconHolder,.trashIconHolder").each(function () { $(this).hide(); });
                //$(this).find(".handIconHolder,.trashIconHolder").show();
            }
        });*/
        fragment.hover(function () {
            if (dragEvent === null)
            {
                var pos = $(this).data("data-pos");
                hoverEvent = 
                    {
                        timestamp: (new Date().getTime() - sessionStartTimeStamp),
                        type: "hover",
                        fragment: 
                            {
                                type: ((pos === -1) ? "distractor" : "fragment"),
                                id: ((pos === -1) ? $(this).data("data-d-id") : pos)
                            },
                        position: $(this).index()                                
                    }
            }
            //$(this).find(".iconHolder").show();
        }, function () {
            if (hoverEvent != null) {
                hoverEvent.durationMs = (new Date().getTime() - sessionStartTimeStamp) - hoverEvent.timestamp;
                if (hoverEvent.durationMs > 1000)
                {
                    hoverEvent.sessionId = sessionId;
                    //events.push(hoverEvent);
                }
                hoverEvent = null;
            }
            //$(this).find(".iconHolder").hide();
        });                        

    }

    function hint() {
        hintCount++;
        var hintEvent = 
            {
                timestamp: (new Date().getTime() - sessionStartTimeStamp),
                type: "hint",
                hintCount: hintCount,
                sessionId: sessionId                            
            }
        var fragments = $(".fragment").filter(function () { return $(this).data("data-pos") >= 0; });
        fragments.each(function () {
            $(this).data("data-lis", 1);
        });
        for (var i = 1; i < fragments.length; i++) 
            for (var j = 0; j < i; j++) {
                var fi = fragments.eq(i);
                var fipos = fi.data("data-pos");
                var filis = fi.data("data-lis");
                var fj = fragments.eq(j);
                var fjpos = fj.data("data-pos");
                var fjlis = fj.data("data-lis");
                if (fipos >= fjpos && (filis < (fjlis + 1))) 
                    fi.data("data-lis", fjlis + 1); 
            }
        var liss = fragments.map(function () { return $(this).data("data-lis") }).get();
        //console.log(liss);
        var maxLis = Math.max.apply(null, liss);
        //console.log("MaxLis", maxLis);                
        var alreadyPlaced = {};
        var missingOrder = [];
        var prevLis = null;                    
        function detectLis(sameLis) {
            var selectedLis = sameLis.eq(Math.floor(Math.random()*sameLis.length));
            sameLis.not(selectedLis).each(function () {
                missingOrder.push($(this));
            });
            // console.log("Selected pos: ", selectedLis.data("data-pos"), ", lis: ", selectedLis.data("data-lis"));
            // sameLis.not(selectedLis).css("background-color", "red")
            //     .each(function () {
            //         console.log("Filtered pos: ", $(this).data("data-pos"), ", lis: ", $(this).data("data-lis"));
            //     });
            return selectedLis;
        }
        while (maxLis > 0) {
            var sameLis = fragments.filter(function () { return $(this).data("data-lis") == maxLis });
            if (prevLis) {
                var prevLisPos = prevLis.data("data-pos");
                var discarted = sameLis.filter(function () { return ($(this).data("data-pos") >= prevLisPos) || ($(this).index() >= prevLis.index()); })
                discarted.each(function () {
                    missingOrder.push($(this));
                });                            
                // discarted.css("background-color", "red")
                //     .each(function () {
                //         console.log("Discarded pos: ", $(this).data("data-pos"), ", lis: ", $(this).data("data-lis"));
                //     });
                sameLis = sameLis.filter(function () { return ($(this).data("data-pos") < prevLisPos) && ($(this).index() < prevLis.index()); })
                prevLis = detectLis(sameLis);;
            } else {
                prevLis = detectLis(sameLis);
            }
            maxLis--;
        }

        var missingOrderOne = null;
        //console.log(missingOrder);
        for (var i=0; i < missingOrder.length; i++)
        {
            if (!missingOrderOne || (missingOrder[i].data("data-pos") < missingOrderOne.data("data-pos")))
                missingOrderOne = missingOrder[i];
        }
        //console.log(missingOrderOne);
        if (missingOrderOne)
        {
            hintEvent.hintType = "order";
            hintEvent.fragment = 
                {
                    type: "fragment",
                    id: missingOrderOne.data("data-pos")
                },   
            hintEvent.position = $(missingOrderOne).index();
            missingOrderOne.addClass("hint");                        
            //var phantom1 = missingOrderOne.clone();
            //missingOrderOne.data("data-pos"):
        } else {
            hintEvent.hintType = "distractor";
            if ($("#taskPane .fragment").filter(function () { return $(this).data("data-pos") < 0; }).length > 0)
            {
                hasBug.show();
                msg.fadeIn();
                setTimeout(function () {
                    msg.fadeOut(function () {
                        hasBug.hide();
                    });                            
                }, 4000);                        
            } else {
                hintEvent.hintType = "OK";
                hintOk.show();
                msg.fadeIn();
                setTimeout(function () {
                    msg.fadeOut(function () {
                        hintOk.hide();
                    });                            
                }, 4000);                            
            }
        }
        events.push(hintEvent);                    
    }

    function buildFragments(puzzle) {
        var programLength = 0;
        shfl = [];
        for (var i = 0; i < puzzle.fragments.length; i++) {
            var fragment = $("<li class='fragment'>");
            fragment.data("data-pos", puzzle.fragments[i].id);                        
            if (puzzle.fragments[i].id == -1) 
                fragment.data("data-d-id", puzzle.fragments[i].distracterId);
            else {
                shfl.push(puzzle.fragments[i].id);
                programLength++;
            }
            fragment.data("data-orig", puzzle.fragments[i].lines);
            var handIconHolder = $("<div class='handIconHolder'>");
            handIconHolder.append($('<i class="far fa-hand-paper fa-sm">'));
            handIconHolder.appendTo(fragment);                      
            var linesHolder = $("<div class='fragmentLinesHolder'>");
            for (var j = 0; j < puzzle.fragments[i].lines.length; j++) {
                var indentContainer = $("<div class='indent'>");
                var text = puzzle.fragments[i].lines[j].replace("}}", "} }");
                $('<pre class="brush: java; gutter: false; auto-links: false; class-name: fragmnt">').text(text).appendTo(indentContainer);
                indentContainer.data('data-orig', text);
                indentContainer.appendTo(linesHolder);
            }
            linesHolder.appendTo(fragment);
            var trashIconHolder = $("<div class='trashIconHolder'>");                        
            trashIconHolder.append($('<i class="fas fa-trash fa-sm">'));
            //trashIconHolder.append("<span>" + puzzle.fragments[i].id  + "</span>");
            trashIconHolder.appendTo(fragment);
            attachHover(fragment);
            fragment.appendTo(taskPane);
        }
        taskPane.data("data-len", programLength);               
        taskPane.find(".trashIconHolder").click(function () {                        
            var li = $(this).closest("li");
            li.removeClass("hint");
            if (li.siblings().length > 0)
            {
                li.fadeOut(function () { 
                    moveCount++;
                    li.appendTo(trash);
                    autoIndent();
                    li.fadeIn();
                    trashed.fadeIn();
                });                                               
            }
        })
        SyntaxHighlighter.highlight();
        autoIndent();                  
    }
    function getPuzzle(studentId) {
        $.ajax({
            url:service + "/" + studentId + "/puzzle",
            type:"GET",
            contentType:"application/json",
            dataType:"json",
            processData: false,
            success: function(puzzle){
                if (puzzle.error) {
                    console.error(puzzle.error);
                    console.log(puzzle);
                } else {
                    moveCount = 0;
                    hintCount = 0;
                    puzzleId = puzzle.id;
                    attemptId = 0;
                    puzzleStartTime = new Date().getTime();
                    puzzleInactivity = 0;
                    puzzleTitle.text(puzzle.title);
                    puzzleDesc.text(puzzle.description);
                    buildFragments(puzzle);
                    puzzleContent.fadeIn();
                    events.push({
                        timestamp: (puzzleStartTime - sessionStartTimeStamp),
                        type: "new",
                        sessionId: sessionId,
                        puzzleId: puzzle.id,
                        puzzleTitle: puzzle.title
                    });
                }
            }
        });  
    }        
    function sendEvaluation(studentId, puzzleId, moveCount, gaveUp) {
        var puzzleEndTime = new Date().getTime();
        var inactivityMs = puzzleInactivity;
        var timeInMs = puzzleEndTime - puzzleStartTime - inactivityMs;                    
        puzzleContent.fadeOut(function () {
            taskPane.empty();
            trash.empty();
            trashed.hide();    
            $.ajax({
                url:service + "/" + studentId + "/puzzle/" + puzzleId + "/eval",
                type:"POST",
                data: JSON.stringify(
                    { 
                        moves: moveCount, 
                        design: "OnePane",
                        shuffling: shfl,
                        timeInMs: timeInMs >= 0 ? timeInMs : 0,
                        inactivityMs: inactivityMs,
                        gaveUp: gaveUp
                    }),
                contentType:"application/json",
                dataType:"json",
                processData: false,
                success: function(){   
                    getPuzzle(studentId);
                }
            });                                                      
        });                                   
    }
    $("#loginButton").click(function () {
        var email = $("#email").val();
        var secret = $("#secret").val(); 
        var instructorEmail = $("#instructorEmail").val(); 
        var failed = false; 
        if (!email) {
            $("#emailRequired").show();
            $("#email").addClass("err");
            failed = true;
        }                     
        if (!secret) {
            $("#secret").addClass("err");
            failed = true;
        }                    
        if (failed) return;
        var sid = sha1(email) + sha1(secret);    
        var ssig = sha1(email);
        var skey = !instructorEmail ? "" : sha1(instructorEmail);
        $.ajax({
            url:service,
            type:"POST",
            data: JSON.stringify({"sid": sid, "ssig": ssig, "skey": skey}),
            contentType:"application/json",
            dataType:"json",
            processData: false,
            success: function(data){         
                if (data.error) {
                    console.error(data.error);
                    console.log(data);
                } else {
                    studentId = data.id;
                    sessionId = data.sessionId;
                    $("#statsUserName").text(email + ", " + studentId);
                    $("#statsInstructor").text(instructorEmail || "<not specified>");
                    var loginEvent =
                        {
                            "timestamp": (new Date().getTime() - sessionStartTimeStamp),
                            //"ip": data.ip,
                            "type": "login",
                            "touchEvents": ('ontouchstart' in document.documentElement),
                            "w": $(window).width(),
                            "h": $(window).height(),
                        };    
                    events.push(loginEvent);
                    userName.val(email);
                    correctlySolved = data.solved;
                    $(".scoreHolder").html(correctlySolved);
                    $(".noneD").each(function () {
                        $(this).removeClass("noneD");
                    })                                
                    loginContent.fadeOut(function () {
                        getPuzzle(studentId);
                    });     
                }                           
            }
        });
    });
    $("#giveUpButton").click(function () {
        // giveUpMsg.show();
        // msg.fadeIn();
        // setTimeout(function () {
        //     msg.fadeOut(function () {
        //         giveUpMsg.hide();
        //     });                                           
        // }, 4000); 
        sendEvents("giveUp");       
        sendEvaluation(studentId, puzzleId, moveCount + hintCount, true);                                                
    });
    function sendAttempt(name, errorsNumber, answer, trash, isWrong) {
        events.push({
            timestamp: (new Date().getTime() - sessionStartTimeStamp),
            type: name,
            hintCount: hintCount,
            puzzleStartTime: (puzzleStartTime - sessionStartTimeStamp),
            attemptId: attemptId,
            attemptTimeMs: (new Date().getTime() - puzzleStartTime),
            sessionId: sessionId,
            programTitle: puzzleTitle.text(),
            errorsNumber: errorsNumber,
            moveCount: moveCount,
            answer: answer,
            trash: trash,
            solutionIsCorrect: !isWrong
        });
        var attempt =
            {                            
                studentId: studentId,
                puzzleId: puzzleId,
                events: events
            };
        events = [];
        attemptId++;
        $.ajax({
                url:service + "/" + studentId + "/puzzle/" + puzzleId + "/events",
                type:"POST",
                data: JSON.stringify(attempt),
                contentType:"application/json",
                dataType:"json",
                processData: false
            });                      
    }
    function sendEvents(name) 
    {
        var lineIndex = 0;
        var expectedLength = taskPane.data("data-len");
        var errorsNumber = 0;
        var answer = [];
        taskPane.find(".fragment").each(function () {
            var pos = $(this).data("data-pos");                  
            if (pos !== lineIndex)
                errorsNumber++;
            if (pos === -1)
            {
                var dId = $(this).data("data-d-id");
                answer.push({type:"distractor", id: dId})
            }
            else 
                answer.push({type:"fragment", id: pos})
            lineIndex++;
        });
        var trashArray = [];
        trash.find(".fragment").each(function () {
            var pos = $(this).data("data-pos");
            if (pos === -1)
            {
                var dId = $(this).data("data-d-id");
                trashArray.push({type:"distractor", id: dId})
            }
            else 
                trashArray.push({type:"fragment", id: pos})                        
        });
        var isWrong = (errorsNumber > 0) || (lineIndex !== expectedLength);
        sendAttempt(name, errorsNumber, answer, trashArray, isWrong);
        return isWrong;
    }
    $("#nextButton").click(function () {
        var isWrong = sendEvents("submit");
        if (isWrong) {                        
            wrongMsg.show();
            msg.show();
            clearTimeout(wrongMsg.t_tmt);
            wrongMsg.t_tmt = 
                setTimeout(function () {
                    if (wrongMsg.is(":visible"))
                    {
                        msg.fadeOut(function () {
                            wrongMsg.hide();
                        });                            
                    }
                }, 4000);
        } else {                        
            correctMsg.show();
            correctlySolved++;
            $(".scoreHolder").html(correctlySolved);
            msg.fadeIn();
            setTimeout(function () {
                msg.fadeOut(function () {
                    correctMsg.hide();
                });                                           
            }, 4000);
            sendEvaluation(studentId, puzzleId, moveCount + hintCount, false);
        }
    });

    // $("#progressButton").click(function () {
    //     $.ajax({
    //         url:service + "/" + studentId + "/stats",
    //         type:"GET",
    //         contentType:"application/json",
    //         dataType:"json",
    //         processData: false,
    //         success: function(stats){
    //             $("#statsPuzzles").text(stats.solved + "/" + stats.seen);
    //             var durationSeconds = Math.round(stats.duration / 1000);
    //             var durationMinutes = Math.round(durationSeconds / 60);
    //             $("#statsSessionDuration").text(durationMinutes + " minutes");
    //             $("#statsDate").text(new Date().toString());
    //             puzzleContent.fadeOut(function () {
    //                 statsContent.fadeIn();
    //             });                                      
    //         }
    //     });                                                                                            
    // });
    $("#backButton").click(function () {
        statsContent.fadeOut(function () {
            puzzleContent.fadeIn();
        });  
    });
    // $("#hintButton").click(function () {
    //     $("li.hint").removeClass("hint");
    //     hint();
    //     msg.hide();    
    //     wrongMsg.hide();
    //     if (wrongMsg.t_tmt)
    //     {
    //         clearTimeout(wrongMsg.t_tmt);
    //         wrongMsg.t_tmt = null;
    //     }
    // });
    $("#gridButton").click(function () {
        taskPane.fadeOut(function () {
            taskPane.toggleClass("noBorder", function () {
                taskPane.fadeIn();
            });
        });
    });
    /*
    $("#consent").change(function () {
        $("#loginButton").prop("disabled", !$(this).is(":checked"));
    });*/
});