'use strict';

/**********************************************************************/
/* RENDERING: JSON AST -> DOM *****************************************/
/**********************************************************************/
/*
 * We define a variety of functions renderX : JQuery -> X_JSON_AST -> ()
 *
 * renderX(info, elt, x) will add a rendering of the object X to the DOM
 * node at elt with information going to info
 *
 * INVARIANTS:
 *   renderX will apply appropriate classes for X, don't do it in advance
 *
 *   renderX checks that the AST is of the right type and has a valid tag
 *
 *   each switch in renderX has the corresponding code from shim.ml as a comment
 *     i.e., always include the code that generates JSON next to the code that renders
 *
 *   classes are of the form X-part1 X-part2 (e.g., redir-src, redir-tgt)
 *
 *   default element to add is a span
 *
 *   field separators are rendered as &nbsp;
 *
 * GLOBAL CLASSES OF IMPORTANCE:
 *   symbolic - for anything treated symbolically
 *
 * IDIOMS AND BEST PRACTICIES
 *   to create new elements for subparts:
 *     let fSrc = $('<span></span>').addClass('redir-File-src').appendTo(elt);
 *
 *   use const and let as much as possible
 */

const fieldSep = '&nbsp;';

/* Redirections *******************************************************/

/* default file redirection fd numbers, by type */
const fileRedirDefault = { 'To': 1,
                           'Clobber': 1,
                           'From': 0,
                           'FromTo': 0,
                           'Append': 1 };

/* default fd duplication fd numbers, by type */
const dupRedirDefault = { 'ToFD': 1,
                          'FromFD': 0 };

/* file redirection symbols */
const fileRedirSym = { 'To': '&gt;', 
                       'Clobber': '&gt;|',
                       'From': '&lt;',
                       'FromTo': '&lt;&gt;',
                       'Append': '&gt;&gt;' };

/* dup redirection symbols */
const dupRedirSym = { 'ToFD': '&gt;&amp;',
                      'FromFD': '&lt;&amp;' }

/* step names */
const stepName = { 'ExpStart': 'Start',
                   'ExpExpand': 'Control code expansion (tildes, variables, commands, arithmetic)',
                   'ExpSplit': 'Field splitting',
                   'ExpPath': 'Pathname expansion',
                   'ExpQuote': 'Quote removal',
                   'ExpError': 'Error',
                   'ExpDone': 'Done' }

function showUnless(def, actual) {
  return def === actual ? "" : String(actual);
}

function renderRedirWith(info, elt, redir, render) {
  console.assert(typeof redir === 'object', 'expected redir object, got ' + redir);
  console.assert('tag' in redir, 'expected tag for statement object');
  console.assert(['File', 'Dup', 'Heredoc'].includes(redir['tag']), 
                 'got weird redir tag ' + redir['tag']);

  const tagClass = 'redir-' + redir['tag']
  const tyClass = tagClass + redir['ty']
  elt.addClass('redir ' + tagClass + ' ' + tyClass);

  switch(redir['tag']) {
    case 'File':
      // | RFile (ty, fd, w) -> 
      //    Assoc [tag "File"; 
      //           ("ty", json_of_redir_type ty); ("src", Int fd); ("tgt", json_of_words w)]
      const fSrc = $('<span></span>').addClass('redir-File-src').appendTo(elt);
      fSrc.append(showUnless(fileRedirDefault[redir['ty']], redir['src']));

      const fSym = $('<span></span>').addClass('redir-File-sym').appendTo(elt);
      fSym.append(fileRedirSym[redir['ty']]);

      const fTgt = $('<span></span>').addClass('redir-File-tgt').appendTo(elt);
      render(info, fTgt, redir['tgt']);

      break;

    case 'Dup':
      // | RDup (ty, src, tgt) -> 
      //    Assoc [tag "Dup";
      //           ("ty", json_of_dup_type ty); ("src", Int src); ("tgt", Int tgt)]

      const dSrc = $('<span></span>').addClass('redir-Dup-src').appendTo(elt);
      dSrc.append(showUnless(dupRedirDefault[redir['ty']], redir['src']));

      const dSym = $('<span></span>').addClass('redir-Dup-sym').appendTo(elt);
      dSym.append(dupRedirSym[redir['ty']]);

      const dTgt = $('<span></span>').addClass('redir-Dup-tgt').appendTo(elt);
      dTgt.append(String(redir['tgt']));

      break;

    case 'Heredoc':
      // | RHeredoc (ty, src, w) -> 
      //    Assoc [tag "Heredoc";
      //           ("ty", json_of_heredoc_type ty); ("src", Int src); ("w", json_of_words w)]


      const hSrc = $('<span></span>').addClass('redir-Heredoc-src').appendTo(elt);
      hSrc.append(showUnless(0, redir['src']));

      const hSym = $('<span></span>').addClass('redir-Heredoc-sym').appendTo(elt);
      hSym.append('&lt;&lt;');

      // compute a collision-free marker:
      //   go through every string entry. if EOF is in there, extend the marker to, e.g., EOFEOF
      //   by the time we're done, we'll have EOF^n for some maximal n.
      //   no need to revisit lines: each line pushes n to the max needed so far
      let marker = "EOF";
      for (let i = 0; i < redir['w'].length; i += 1) {
          const entry = redir['w'][i];
          if (entry['tag'] === "S") {
              const lines = entry['v'].split(/\n\r|\n|\r/);
              while (lines.includes(marker)) {
                  marker += "EOF";
              }
          }
      }

      hSym.append(marker);
      hSym.append('<br></br>');

      // use code tag to get tt fonts, which will present newlines
      const hText = $('<pre></pre>').addClass('redir-Heredoc-text').appendTo(elt);
      render(info, hText, redir['w']);

      const hMarker = $('<span></span>').addClass('redir-Heredoc-marker').appendTo(elt);
      hMarker.append(marker);
      
      break;

    default:
      debugger;
  }
}

function renderRedir(info, elt, redir) {
  renderRedirWith(info, elt, redir, renderWords);
}

function renderExpandedRedir(info, elt, redir) {
  renderRedirWith(info, elt, redir, renderFields);
}

/* Statements *********************************************************/

function stmtSimple(info, elt, stmt, fAssign, fArgs) {
      const assignsExp = $('<span></span>').addClass('simple-assigns').appendTo(elt);
      for (const assign of stmt['assigns']) {
        const a = $('<span></span>').addClass('assign').appendTo(assignsExp);
        $('<span></span>').addClass('variable').append(assign['var']).appendTo(a);
        
        a.append('=');
        
        const v = $('<span></span>').addClass('variable').appendTo(a);
        fAssign(info, v, assign['value']);
      }
    
      // if we had an assignment and also have args or redirects, then put a space in
      if (stmt['assigns'].length !== 0 && 
          (stmt['args'].length !== 0 || stmt['rs'].length !== 0)) {
        assignsExp.append(fieldSep);
      }
    
      const argsExp = $('<span></span>').addClass('simple-args').appendTo(elt);
      fArgs(info, argsExp, stmt['args']);

      // if we have following redirs, then put a space in
      if (   ('rs' in stmt && stmt['rs'].length !== 0)
          || ('ers' in stmt && stmt['ers'].length !== 0)) {
        argsExp.append(fieldSep);
      }

      stmtRedirs(info, elt, 'simple', stmt);
}

function stmtRedirs(info, elt, name, stmt) {
  var redirs = $('<span></span>').addClass(name + '-redirs').appendTo(elt);

  // ask the next pass to add a sep
  let needSep = false;

  // render expanded redirects
  if ('ers' in stmt) {
    for (let i = 0; i < stmt['ers'].length; i += 1) {
      const r = $('<span></span>').appendTo(redirs);    
      renderExpandedRedir(info, r, stmt['ers'][i]);

      if (i !== stmt['ers'].length - 1) {
        redirs.append(fieldSep);
      }      
    }

    needSep = true;
  }

  // render currently expanding redirect
  if ('exp_redir' in stmt) {
    if (needSep) {
      redirs.append(fieldSep);
      needSep = false;
    }

    const r = $('<span></span>').appendTo(redirs);    
    renderRedirWith(info, r, stmt['exp_redir'], renderExpansionState);

    needSep = true;
  }

  // render unexpanded redirects
  if ('rs' in stmt) {
    for (let i = 0; i < stmt['rs'].length; i += 1) {
      if (needSep) {
        redirs.append(fieldSep);
        needSep = false;
      }
  
      const r = $('<span></span>').appendTo(redirs);    
      renderRedir(info, r, stmt['rs'][i]);
      
      if (i !== stmt['rs'].length - 1) {
        redirs.append(fieldSep);
      }
    }
  }
}

function stmtBinary(info, elt, name, sym, stmt) {
  const c1 = $('<span></span>').addClass(name + '-left').appendTo(elt);
  renderStmt(info, c1, stmt['l']);
  
  elt.append(fieldSep + sym + fieldSep);
  
  const c2 = $('<span></span>').addClass(name + '-right').appendTo(elt);
  renderStmt(info, c2, stmt['r']);
}

function stmtWhile(info, elt, stmt) {
    // | While (c1, c2) -> 
    //    Assoc [tag "While"; ("cond", json_of_stmt c1); ("body", json_of_stmt c2)]
    
    const kw   = stmt['cond']['tag'] === 'Not' ? 'until' : 'while';
    const cond = stmt['cond']['tag'] === 'Not' ? stmt['cond']['c'] : stmt['cond'];
  
    elt.append(kw + fieldSep);
      
    const c = $('<span></span>').addClass(kw + '-cond').appendTo(elt);
    renderStmt(info, c, cond);

    elt.append(';' + fieldSep + 'do' + fieldSep);
    
    const body = $('<span></span>').addClass(kw + '-body').appendTo(elt);
    renderStmt(info, body, stmt['body']);
    
    elt.append(';' + fieldSep + 'done');
}

function stmtFor(info, elt, fArgs, stmt) {
    // | For (x, args, c) -> 
    //    Assoc [tag "ForExpArgs"; ("var", String x); ("args", ??? args); ("body", json_of_stmt c)]
    
    elt.append('for' + fieldSep);
    $('<span></span>').addClass('for-varname variable').append(stmt['var']).appendTo(elt);
    elt.append(fieldSep + 'in' + fieldSep);
    
    var w = $('<span></span>').addClass('for-args').appendTo(elt);
    fArgs(info, w, stmt['args']);
    
    elt.append(';' + fieldSep + 'do' + fieldSep);
    
    var body = $('<span></span>').addClass('for-body').appendTo(elt);
    renderStmt(info, body, stmt['body']);
    
    elt.append(';' + fieldSep + 'done');
}

function renderPatterns(info, elt, patterns) {
    for (let i = 0; i < patterns.length; i += 1) {
        const pat = $('<span></span>').appendTo(elt);
        renderWords(info, pat, patterns[i]);
        
        if (i !== patterns.length - 1) {
            pat.append(fieldSep);
            pat.append("|");
            pat.append(fieldSep);
        }
    }
}

function stmtCase(info, elt, fArgs, stmt) {
    elt.append('case' + fieldSep);

    var w = $('<span></span>').addClass('case-args').appendTo(elt);
    fArgs(info, w, stmt['args']);
  
    elt.append(fieldSep + 'in' + fieldSep);
    
    // json_of_case (w, c) = Assoc [("pat", json_of_words w); ("stmt", json_of_stmt c)]
    let cases = $('<span></span>').addClass('case-cases').appendTo(elt);

    // special case for CaseCheckMatch
    // slightly breaks rendering since we peel off each pattern one-by-one, so case numbers will change if | is used heavily
    if ('pat' in stmt && 'c' in stmt) {
        let eCase = $('<span></span>').addClass('case').appendTo(cases);

        let pat = $('<span></span>').addClass('case-pattern').appendTo(eCase);
        renderExpansionState(info, pat, stmt['pat']);

        eCase.append(')' + fieldSep);

        var body = $('<span></span>').addClass('case-stmt').appendTo(eCase);
        renderStmt(info, body, stmt['c']);

        eCase.append(fieldSep + ';;');
    }
    
    for (const c of stmt['cases']) {
        let eCase = $('<span></span>').addClass('case').appendTo(cases);

        let pats = $('<span></span>').addClass('case-pattern').appendTo(eCase);
        renderPatterns(info, pats, c['pats']);

        eCase.append(')' + fieldSep);

        var body = $('<span></span>').addClass('case-stmt').appendTo(eCase);
        renderStmt(info, body, c['stmt']);

        eCase.append(fieldSep + ';;');
    }
  
    elt.append(fieldSep + ' esac');
}

function renderStmt(info, elt, stmt) {
  console.assert(typeof stmt === 'object', 'expected statement object, got ' + stmt);
  console.assert('tag' in stmt, 'expected tag for statement object');
  console.assert(['Command', 'CommandExpAssign', 'CommandExpArgs', 'CommandExpRedirs',
                  'Pipe', 
                  'Redir', 'RedirExpRedirs', 
                  'Background', 'BackgroundExpRedirs', 
                  'Subshell', 'SubshellExpRedirs',
                  'And', 'Or', 'Not', 'Semi', 'If', 
                  'While', 'WhileCond', 'WhileRunning',
                  'For', 'ForExpArgs', 'ForExpanded', 'ForRunning',
                  'Case', 'CaseExpArg', 'CaseMatch', 'CaseCheckMatch',
                  'Defun', 'Call',
                  'Break', 'Continue', 'Return', 
                  'Exec', 'Wait', 'Exit', 'Done'].includes(stmt['tag']), 
                 'got weird statement tag ' + stmt['tag']);

  elt.addClass('stmt stmt-' + stmt['tag']);
  
  switch (stmt['tag']) {
    case 'Command':
      // | Command (assigns, args, rs) -> 
      //    Assoc [tag "Command"; 
      //           ("assigns", List (List.map json_of_assign assigns));
      //           ("args", json_of_words args);
      //           ("rs", json_of_redirs rs)]

      stmtSimple(info, elt, stmt, renderWords, renderWords);

      break;

    case 'CommandExpAssign':
      // | CommandExpAssign (assigns, args, rs) -> 
      //    Assoc [tag "CommandExpAssign"; 
      //           ("assigns", List (List.map json_of_inprogress_assign assigns));
      //           ("args", json_of_words args);
      //           ("rs", json_of_redirs rs)]

      stmtSimple(info, elt, stmt, renderExpansionState, renderWords);

      break;

    case 'CommandExpArgs':
      // | CommandExpArgs (assigns, args, rs) ->
      //    Assoc [tag "CommandExpArgs"; 
      //           ("assigns", List (List.map json_of_expanded_assign assigns));
      //           ("args", json_of_expansion_state args);
      //           ("rs", json_of_redirs rs)]

      stmtSimple(info, elt, stmt, renderFields, renderExpansionState);

      break;

    case 'CommandExpRedirs':
      // | CommandExpRedirs (assigns, args, ers, mes, rs) ->
      //    Assoc ([tag "CommandExpRedirs"; 
      //            ("assigns", List (List.map json_of_expanded_assign assigns));
      //            ("args", json_of_fields args);
      //            ("ers", json_of_expanded_redirs ers)] @
      //            (match mes with
      //             | None -> [] 
      //             | Some es -> [("exp_redir", json_of_expanding_redir es)]) @
      //            [("rs", json_of_redirs rs)])

      stmtSimple(info, elt, stmt, renderFields, renderFields);

      break;

    case 'Pipe':
      // | Pipe (bg, cs) -> 
      //    Assoc [tag "Pipe"; ("bg", Bool bg); ("cs", List (List.map json_of_stmt cs))]

      const commands = $('<span></span>').addClass('pipe-commands').appendTo(elt);
      for (let i = 0; i < stmt['cs'].length; i += 1) {
        const c = $('<span></span>').appendTo(commands);
        renderStmt(info, c, stmt['cs'][i]); 

        if (i != stmt['cs'].length - 1) {
          commands.append(fieldSep + '|' + fieldSep);
        }
      }

      if (stmt['bg']) {
        elt.append(fieldSep + '&amp;');
      }

      break;

    case 'Redir':
    case 'RedirExpRedirs':
      // | Redir (c, rs) -> obj_crs "Redir" c rs
      // | RedirExpRedirs (c, redir_state) ->
      //    Assoc ([tag "RedirExpRedirs";
      //            ("c", json_of_stmt c)]
      //           @ fields_of_redir_state redir_state)

      var command = $('<span></span>').addClass('redir-command').appendTo(elt);
      renderStmt(info, command, stmt['c']);

      elt.append(fieldSep);

      stmtRedirs(info, elt, 'redir', stmt);

      break;

    case 'Background':
    case 'BackgroundExpRedirs':
      // | Background (c, rs) -> obj_crs "Background" c rs
      // | BackgroundExpRedirs (c, redir_state) ->
      //    Assoc ([tag "BackgroundExpRedirs";
      //            ("c", json_of_stmt c)]
      //           @ fields_of_redir_state redir_state)

      /* we translate 
           cmds... &
        to
           { cmds & }
        this avoids issues with parsing; in particular,
          cmd1 & ; cmd2 & ; cmd3
        doesn't parse; it must be:
          cmd1 & cmd2 & cmd3
        it's a little too annoying to track "was the last thing
        backgrounded?" so the braces resolve the issue. testing
        indicates that they're semantically equivalent.
      */

      elt.append('{' + fieldSep); 

      var command = $('<span></span>').addClass('bg-command').appendTo(elt);
      renderStmt(info, command, stmt['c']);

      elt.append(fieldSep);

      stmtRedirs(info, elt, 'redir', stmt);

      elt.append(fieldSep + '}' + fieldSep + '&amp;'); 

      break;

    case 'Subshell':
    case 'SubshellExpRedirs':
      // | Subshell (c, rs) -> obj_crs "Subshell" c rs
      // | SubshellExpRedirs (c, redir_state) ->
      //    Assoc ([tag "SubshellExpRedirs";
      //            ("c", json_of_stmt c)]
      //           @ fields_of_redir_state redir_state)

      elt.append('('); 

      const subC = $('<span></span>').addClass('subshell-command').appendTo(elt);
      renderStmt(info, subC, stmt['c']);

      elt.append(fieldSep);

      stmtRedirs(info, elt, 'subshell', stmt);

      elt.append(')'); 

      break;

    case 'And':
      // | And (c1, c2) -> obj_lr "And" c1 c2

      stmtBinary(info, elt, 'and', '&amp;&amp;', stmt);

      break;

    case 'Or':
      // | Or (c1, c2) -> obj_lr "Or" c1 c2

      stmtBinary(info, elt, 'or', '||', stmt);

      break;

    case 'Not':
      // | Not c -> Assoc [tag "Not"; ("c", json_of_stmt c)]

      // for parsing reasons similar to bg above

      elt.append('!' + fieldSep + '{' + fieldSep);

      const cNot = $('<span></span>').addClass('not-stmt').appendTo(elt);
      renderStmt(info, cNot, stmt['c']);

      elt.append(fieldSep + '}');

      break;

    case 'Semi':
      // | Semi (c1, c2) -> obj_lr "Semi" c1 c2

      stmtBinary(info, elt, 'semi', ';', stmt);

      break;

    case 'If':
      // | If (c1, c2, c3) -> 
      //    Assoc [tag "If"; ("c", json_of_stmt c1); ("t", json_of_stmt c2); ("e", json_of_stmt c3)]

      elt.append('if' + fieldSep);

      var c1 = $('<span></span>').addClass('if-cond').appendTo(elt);
      renderStmt(info, c1, stmt['c']);

      elt.append(fieldSep + 'then' + fieldSep);

      var c2 = $('<span></span>').addClass('if-then').appendTo(elt);
      renderStmt(info, c2, stmt['t']);

      var c3 = $('<span></span>').addClass('if-else').appendTo(elt);
      let cElse = stmt['e'];
      if (typeof cElse === 'object' && 
          'tag' in cElse && cElse['tag'] === 'Command' &&
          cElse['assigns'] === [] && cElse['args'] === [] && cElse['rs'] === []) {
        // one-armed if
        elt.append(';' + fieldSep + 'fi');
      } else if (typeof cElse === 'object' && 
          'tag' in cElse && cElse['tag'] === 'If') {
        // else-if, rely on recursion to get the fi
        c3.append(';' + fieldSep + 'el');
        renderStmt(info, c3, cElse);
      } else {
        // plain else clause, provide our own fi
        renderStmt(info, c3, cElse);
        elt.append(';' + fieldSep + 'fi');
      }

      break;

    case 'While':
      stmtWhile(info, elt, stmt);
      break;

    case 'WhileCond':
      elt.append('if' + fieldSep);
      
      var c1 = $('<span></span>').addClass('while-current iteration').appendTo(elt);
      renderStmt(info, c1, stmt['cur']);
  
      elt.append(fieldSep + 'then;' + fieldSep);  

      var c2 = $('<span></span>').addClass('while-current').appendTo(elt);
      renderStmt(info, c2, stmt['body']);

      elt.append(fieldSep + ';' + fieldSep);  
      
      var c3 = $('<span></span>').addClass('while-loop').appendTo(elt);
      stmtWhile(info, elt, stmt);

      elt.append(fieldSep + ';' + fieldSep + 'fi');
      break;

  case 'WhileRunning':
      var c1 = $('<span></span>').addClass('while-current iteration').appendTo(elt);
      renderStmt(info, c1, stmt['cur']);
  
      elt.append(fieldSep + ';' + fieldSep);  

      var c2 = $('<span></span>').addClass('while-loop').appendTo(elt);
      stmtWhile(info, elt, stmt);
      break;

    case 'For':
      // | For (x, w, c) -> 
      //    Assoc [tag "For"; ("var", String x); ("args", json_of_words w); ("body", json_of_stmt c)]

      stmtFor(info, elt, renderWords, stmt);
      break;

    case 'ForExpArgs':
      // | ForExpArgs (x, exp_state, c) -> 
      //    Assoc [tag "ForExpanded"; ("var", String x); ("args", json_of_expansion_state exp_state); ("body", json_of_stmt c)]

      stmtFor(info, elt, renderExpansionState, stmt);
      break;

    case 'ForExpanded':
      // | ForExpanded (x, f, c) -> 
      //    Assoc [tag "ForExpanded"; ("var", String x); ("args", json_of_fields f); ("body", json_of_stmt c)]

      stmtFor(info, elt, renderFields, stmt);
      break;

    case 'ForRunning':
      // | ForRunning (x, f, body, cur) -> 
      //    Assoc [tag "ForExpanded"; ("var", String x); ("args", json_of_fields f); ("body", json_of_stmt c); ("cur", json_of_stmt cur)]

      var c1 = $('<span></span>').addClass('for-current iteration').appendTo(elt);
      renderStmt(info, c1, stmt['cur']);
  
      elt.append(fieldSep + ';' + fieldSep);  

      var c2 = $('<span></span>').addClass('for-loop').appendTo(elt);
      stmtFor(info, c2, renderFields, stmt);
      break;

    case 'Case':
      // | Case (w, cases) -> 
      //    Assoc [tag "Case"; ("args", json_of_words w); ("cases", List (List.map json_of_case cases))]
      stmtCase(info, elt, renderWords, stmt);

      break;

    case 'CaseExpArg':
      //  | CaseExpArg (w, cases) -> 
      //     Assoc [tag "CaseExpArg"; ("args", json_of_expansion_state w); ("cases", List (List.map json_of_case cases))]

      stmtCase(info, elt, renderExpansionState, stmt);

      break;

    case 'CaseMatch':
    case 'CaseCheckMatch':
      //  | CaseMatch (w, cases) -> 
      //     Assoc [tag "CaseMatch"; ("args", json_of_symbolic_string w); ("cases", List (List.map json_of_case cases))]

      //  | CaseCheckMatch (w, pat, c, cases) -> 
      //     Assoc [tag "CaseCheckMatch";
      //            ("args", json_of_symbolic_string w);
      //            ("pat", json_of_expansion_state pat);
      //            ("c", json_of_stmt c);
      //            ("cases", List (List.map json_of_case cases))]

      stmtCase(info, elt, renderSymbolicString, stmt);
      
      break;
      
    case 'Defun':
      // | Defun (f, c) -> Assoc [tag "Defun"; ("name", String f); ("body", json_of_stmt c)]

      // we force { } to make sure it always parses

      let name = $('<span></span>').addClass('defun-name variable').appendTo(elt);
      name.append(stmt['name']);

      elt.append('()' + fieldSep + '{' + fieldSep);

      var body = $('<span></span>').addClass('defun-body').appendTo(elt);
      renderStmt(info, body, stmt['body']);

      elt.append(fieldSep + '}');

      break;
      
    case 'Call':
      // | Call (outer_loop_nest, func, orig, c) ->
      //   Assoc [tag "Call";
      //          ("loop_nest", Int outer_loop_nest);
      //          ("f", String func);
      //          ("orig", json_of_stmt orig);
      //          ("c", json_of_stmt c)]

      var cmd = $('<span></span>').addClass('function call').appendTo(elt);
      var comment = $('<span></span>').addClass('comment').appendTo(elt);
      comment.append('in call to ' + stmt['f']);

      renderStmt(info, cmd, stmt['c']);
      
      break;
      
    case 'Break':
      $('<i></i>').addClass('icon external link alternate').appendTo(info);

      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);
      cmd.append('break' + fieldSep + stmt['n']);
      
      break;

    case 'Continue':
      $('<i></i>').addClass('icon undo alternate').appendTo(info);

      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);
      cmd.append('continue' + fieldSep + stmt['n']);

      break;

    case 'Return':
      $('<i></i>').addClass('icon eject').appendTo(info);
      
      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);
      cmd.append('return');
      
      break;

    case 'Exec':
      // | Exec (cmd, args, env) -> 
      //    Assoc [tag "Exec";
      //           ("cmd", json_of_symbolic_string cmd);
      //           ("args", json_of_fields args);
      //           ("env", json_of_env env)]

      $('<i></i>').addClass('icon sign out alternate').appendTo(info);      

      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);

      renderSymbolicString(info, cmd, stmt['cmd']);

      const argsExp = $('<span></span>').addClass('simple-args').appendTo(elt);
      renderFields(info, argsExp, stmt['args']);

      // TODO 2018-09-06 show env?

    case 'Wait':
      // | Wait (n, bound) -> 
      //    Assoc ([tag "Wait"; ("pid", Int n)] @
      //             match bound with
      //             | None -> []
      //             | Some steps -> [("steps", Int steps)])

      $('<i></i>').addClass('icon wait').appendTo(info);

      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);

      cmd.append('wait' + fieldSep + stmt['pid'].toString());

      if ('steps' in stmt) {
          var comment = $('<span></span>').addClass('comment').appendTo(elt);
          comment.append('waiting ' + stmt['steps'].toString() + ' steps');
      }

      break;

    case 'Exit':
      $('<i></i>').addClass('icon power off').appendTo(info);

      var cmd = $('<span></span>').addClass('command builtin control').appendTo(elt);
      cmd.append('exit');

      break;
      
    case 'Done':
      $('<i></i>').addClass('icon check circle outline').appendTo(info);

      break;

    default:
      debugger;
  }
};

/* Symbolic values ****************************************************/

function renderSymbolicChar(info, elt, symbolic) {
  console.assert(typeof symbolic === 'object', 'expected symbolic character object, got ' + symbolic);
  console.assert('tag' in symbolic, 'expected tag for symbolic character object');
  console.assert(['SymCommand', 'SymArith', 'SymPat'].includes(symbolic['tag']), 
                 'got weird symbolic character tag ' + symbolic['tag']);

  elt.addClass('symbolic symbolic-' + symbolic['tag']);

  switch (symbolic['tag']) {
    case 'SymCommand':
      //  | SymCommand c -> Assoc [tag "SymCommand"; ("stmt", json_of_stmt c)]
  
      elt.append('$(');
      var stmt = $('<span></span>').addClass('stmt').appendTo(elt);
      renderStmt(info, stmt, symbolic['stmt']);
      elt.append(')');
    
      break;

    case 'SymArith':
      //  | SymArith f -> Assoc [tag "SymArith"; ("f", json_of_fields f)]
  
      elt.append('$((');
      elt.append('<span></span>').addClass('param-varname variable').append(control['var']);
      var f = $('<span></span>').appendTo(fmt);
      renderFields(info, f, control['f']);

      var w = $('<span></span>').appendTo(fmt);
      renderWords(info, w, control['w']);

      elt.append('))');                 

      break;

    case 'SymPat':
      //  | SymPat (mode, pat, s) -> Assoc [tag "SymPat";
      //                                    ("mode", json_of_substring_mode mode);
      //                                    ("pat", json_of_symbolic_string pat);
      //                                    ("s", json_of_symbolic_string s)]

      elt.append('${');

      var varname = $('<span></span>').addClass('param-varname').appendTo(elt);
      varname.append(control['var']);
      varname.append('=');
      var w = $('<span></span>').appendTo(varname);
      renderWords(info, w, control['s']);

      var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
      fmt.append(renderSubstring(control['side'], control['mode']));

      var pat = $('<span></span>').appendTo(elt);
      renderFields(info, pat, control['pat']);

      elt.append('}');

      break;

    default:
      debugger;

  }
};

function renderSymbolicString(info, elt, ss) {
  console.assert(typeof ss === 'object', 'expected symbolic string list, got ' + ss);
  console.assert('length' in ss, 'expected length field for symbolic string, got ' + ss);

  for (let i = 0;i < ss.length; i += 1) {
    let c = $('<span></span>').addClass('field-char').appendTo(elt);

    switch (typeof ss[i]) {
      case 'string':
        c.append(ss[i])

        break;

      case 'object':
        renderSymbolicChar(info, c, ss[i]);

        break;

      default:
        debugger;
    }
  }
};

/* Fields, intermediate fields, and expanded words******************************/

function renderFields(info, elt, fields) {
  console.assert(typeof fields === 'object', 'expected fields list, got ' + fields);
  console.assert('length' in fields, 'expected length field for fields object');

  elt.addClass('fields');

  for (let i = 0; i < fields.length; i += 1) {
    const s = $('<span></span>').addClass('field').appendTo(elt);
    renderSymbolicString(info, s, fields[i]);

    if (i !== fields.length - 1) {
      $('<span></span>').addClass('field-separator').append(fieldSep).appendTo(elt);
    }
  }
};

function renderTmpField(info, elt, tf) {
  console.assert(typeof tf === 'object', 'expected temp field character, got ' + tf);
  console.assert('tag' in tf, 'expected tag field in temp field character');
  console.assert(['WFS','FS','Field','QField'].includes(tf['tag']));

  elt.addClass('tmp-field');
  elt.addClass('tmp-field-' + tf['tag']);
  
  switch (tf['tag']) {
    case 'WFS':
      // | WFS -> Assoc [tag "WFS"]
      elt.append(fieldSep);

      break;

    case 'FS':
      // | FS -> Assoc [tag "FS"]
      elt.append(fieldSep);

      break;

    case 'Field':
      // | Field s -> Assoc [tag "Field"; ("s", json_of_symbolic_string s)]

      const f = $('<span></span>').appendTo(elt);
      renderSymbolicString(info, f, tf['s']);

      break;

    case 'QField':
      // | QField s -> Assoc [tag "QField"; ("s", json_of_symbolic_string s)]

      const qf = $('<span></span>').appendTo(elt);
      qf.append('&ldquo;');
      renderSymbolicString(info, qf, tf['s']);
      qf.append('&rdquo;');
    
      break;

    default:
      debugger;
  }
}

function renderIntermediateFields(info, elt, ifs) {
  console.assert(typeof ifs === 'object', 'expected intermediate field list, got ' + ifs);
  console.assert('length' in ifs, 'expected length field for intermediate field list');
  
  elt.addClass('intermediate-fields');

  for (const tmp_field of ifs) {
    const tf = $('<span></span>').appendTo(elt);
    renderTmpField(info, tf, tmp_field);
  }
}

function renderExpandedWord(info, elt, w) {
  console.assert(typeof w === 'object', 'expected expanded word character, got ' + w);
  console.assert('tag' in w, 'expected tag field in expanded word character');
  console.assert(['UsrF','ExpS','At','DQuo','UsrS','EWSym'].includes(w['tag']));

  elt.addClass('expanded-word-' + w['tag']);

  switch (w['tag']) {
    case 'UsrF':
      // | UsrF -> obj "UsrF"

      elt.append(fieldSep);

      break;

    case 'ExpS':
      // | ExpS s -> obj_v "ExpS" s

      elt.addClass('generated');
      elt.append(w['v']);

      break;

    case 'At':
      // | At f -> obj_f "At" f

      elt.addClass('generated dollar-at');
      const fs = $('<span></span>').appendTo(elt);
      renderFields(info, fs, w['f']);
      
      break;

    case 'DQuo':
      // | DQuo s -> obj_v "DQuo" s
      
      elt.addClass('quoted');
      elt.append('"');
      const f = $('<span></span>').appendTo(elt);
      renderSymbolicString(info, f, w['s']);
      elt.append('"');

      break;

    case 'UsrS':
      // | UsrS s -> obj_v "UsrS" s

      elt.append(w['v']);

      break;

    case 'EWSym':
      // | EWSym sym -> Assoc [tag "EWSym"; ("s", json_of_symbolic sym)]

      let sym = $('<span></span>').appendTo(elt);
      renderSymbolicChar(info, sym, w['s']);
      break;

    default:
      debugger;
  }
};

function renderExpandedWords(info, elt, w) {
  console.assert(typeof w === 'object', 'expected expanded word list, got ' + w);
  console.assert('length' in w, 'expected length field for expanded words object');

  for (let i = 0; i < w.length; i += 1) {
    let char = $('<span></span>').addClass('expanded-word').appendTo(elt);
    renderExpandedWord(info, char, w[i]);
  }
};

/* Words and entries: control codes, etc., pre-expansion ***************/

function renderSubstring(side, mode) {
  console.assert(typeof side === 'string', 'expected string for side, got ' + side);
  console.assert(typeof mode === 'string', 'expected string for mode, got ' + mode);
  console.assert(['Prefix', 'Suffix'].includes(side), 'got weird mode ' + mode);
  console.assert(['Shortest', 'Longest', 'Exact'].includes(mode), 'got weird mode ' + mode);

  var r = side === 'Prefix' ? '#' : '%';
  // by rights, 'Exact' shouldn't really come up here---it's used for case statements. but: safety first!
  return ['Shortest', 'Exact'].includes(mode) ? r : r + r;
};

function renderFormatChar(format) {
  console.assert(typeof format === 'object', 'expected format object, got ' + format);
  console.assert('tag' in format, 'expected tag for format object');
  console.assert(['Normal', 'Length', 'Default', 'NDefault',
                  'Assign', 'NAssign', 'Error', 'NError',
                  'Alt','NAlt','Substring'].includes(format['tag']), 
                 'got weird format tag ' + format['tag']);

  switch (format['tag']) {
    case 'Normal':
      return '';
    case 'Length':
      return '#'; // but should be special cased
    case 'Default':
      return '-';
    case 'NDefault':
      return ':-';
    case 'Assign':
      return '=';
    case 'NAssign':
      return ':=';
    case 'Error':
      return '?';
    case 'NError':
      return ':?';
    case 'Alt':
      return '+';
    case 'NAlt':
      return ':+';
    case 'Substring':
      return renderSubstring(format['side'], format['mode']);
    default:
      debugger;
  }
};

function renderFormat(info, elt, format) {
  console.assert(typeof format === 'object', 'expected format object, got ' + format);
  console.assert('tag' in format, 'expected tag for format object');
  console.assert(['Normal', 'Length', 'Default', 'NDefault',
                  'Assign', 'NAssign', 'Error', 'NError',
                  'Alt','NAlt','Substring'].includes(format['tag']), 
                 'got weird format tag ' + format['tag']);

  elt.append(renderFormatChar(format));

  switch (format['tag']) {
    case 'Normal':
    case 'Length':
      break;

    case 'Default':
    case 'NDefault':
    case 'Assign':
    case 'NAssign':
    case 'Error':
    case 'NError':
    case 'Alt':
    case 'NAlt':
      var w = $('<span></span>').appendTo(elt);
      renderWords(info, w, format['w']);

      break;

    case 'Substring':
      //  | Substring (side,mode,w) -> Assoc [tag "Substring";
      //                                      ("side", json_of_substring_side side);
      //                                      ("mode", json_of_substring_mode mode);
      //                                      ("w", json_of_words w)]

      var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
      fmt.append(renderSubstring(control['side'], control['mode']));

      var w = $('<span></span>').appendTo(elt);
      renderWords(w, control['w']);

      break;

    default:
      debugger;
  }
};

function renderControl(info, elt, control) {
  console.assert(typeof control === 'object', 'expected control object, got ' + control);
  console.assert('tag' in control, 'expected tag for control object');
  console.assert(['Tilde', 'TildeUser', 'Param', 'LAssign', 'LMatch',
                  'LError', 'Backtick', 'LBacktick', 'Arith', 'Quote'].includes(control['tag']), 
                 'got weird control tag ' + control['tag']);

  elt.addClass('control-' + control['tag']);
  
  switch (control['tag']) {
    case 'Tilde':
      // | Tilde -> obj "Tilde"

      elt.append('~');

      break;

    case 'TildeUser':
      // | TildeUser user -> Assoc [tag "TildeUser"; ("user", String user)]

      elt.append('~' + control['user']);

      break;

    case 'Param':
      // | Param (x,fmt) -> Assoc [tag "Param"; ("var", String x); ("fmt", json_of_format fmt)]

      elt.append('${');
      // special case for pretty-printing of ${#x}
      if (control['fmt'] === 'Length') {
        elt.append('#');
      }

      $('<span></span>').addClass('param-varname').append(control['var']).appendTo(elt);

      if (control['fmt'] !== 'Length') {
        var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
        renderFormat(info, fmt, control['fmt']);
      }
      elt.append('}');

      break;

    case 'LAssign':
      // | LAssign (x,f,w) -> Assoc [tag "LAssign"; ("var", String x);
      //                             ("f", json_of_expanded_words f); ("w", json_of_words w)]
    
      elt.append('${');
      $('<span></span>').addClass('param-varname').append(control['var']).appendTo(elt);

      var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
      fmt.append('=');

      var f = $('<span></span>').appendTo(fmt);
      renderExpandedWords(info, f, control['f']);

      var w = $('<span></span>').appendTo(fmt);
      renderWords(info, w, control['w']);

      elt.append('}');

      break;

    case 'LMatch':
      // | LMatch (x,side,mode,f,w) -> Assoc [tag "LMatch"; ("var", json_of_fields x);
      //                                      ("side", json_of_substring_side side);
      //                                      ("mode", json_of_substring_mode mode);
      //                                      ("f", json_of_expanded_words f); ("w", json_of_words w)]

      elt.append('${');
      $('<span></span>').addClass('param-varname').append(control['var']).appendTo(elt);

      var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
      fmt.append(renderSubstring(control['side'], control['mode']));

      var f = $('<span></span>').appendTo(elt);
      renderExpandedWords(info, f, control['f']);

      var w = $('<span></span>').appendTo(elt);
      renderWords(info, w, control['w']);

      elt.append('}');

      break;

    case 'LError':
      // | LError (x,f,w) -> Assoc [tag "LError"; ("var", String x);
      //                            ("f", json_of_expanded_words f); ("w", json_of_words w)]
      elt.append('${');
      elt.append('<span></span>').addClass('param-varname').append(control['var']);

      var fmt = $('<span></span>').addClass('param-format').appendTo(elt);
      fmt.append('?');

      var f = $('<span></span>').appendTo(fmt);
      renderExpandedWords(info, f, control['f']);

      var w = $('<span></span>').appendTo(fmt);
      renderWords(info, w, control['w']);

      elt.append('}');

      break;

    case 'Backtick':
      // | Backtick c -> Assoc [tag "Backtick"; ("stmt", json_of_stmt c)]

      elt.append('$(');
      var stmt = $('<span></span>').addClass('stmt').appendTo(elt);
      renderStmt(info, stmt, control['stmt']);
      elt.append(')');

      break;

    case 'LBacktick':
      // | LBacktick (corig, pid, fd_read) -> Assoc [tag "LBacktick"; 
      //                                             ("orig", json_of_stmt corig);
      //                                             ("pid", Int pid);
      //                                             ("fd_read", Int fd_read)]

      elt.append('$(');
      var stmt = $('<span></span>').addClass('stmt').appendTo(elt);
      renderStmt(info, stmt, control['orig']);
      elt.append(') ');
      var comment = $('<span></span>').addClass('comment').appendTo(elt);
      comment.append('running with pid ' + control['pid'].toString());

      break;

    case 'Arith':
      // | Arith (f,w) ->  obj_fw "Arith" f w

      elt.append('$((');

      var f = $('<span></span>').appendTo(elt);
      renderExpandedWords(info, f, control['f']);

      var w = $('<span></span>').appendTo(elt);
      renderWords(info, w, control['w']);

      elt.append('))');                 

      break;

    case 'Quote':
      // | Quote f w -> obj_fw "Quote" f w

      elt.addClass('quoted');
      elt.append('"');

      var f = $('<span></span>').appendTo(elt);
      renderExpandedWords(info, f, control['f']);
      
      var w = $('<span></span>').appendTo(elt);
      renderWords(info, w, control['w']);

      elt.append('"');

      break;

    default:
      debugger;
  }
};

function renderEntry(info, elt, entry) {
  console.assert(typeof entry === 'object', 'expected entry object, got ' + entry);
  console.assert('tag' in entry, 'expected tag for entry object');
  console.assert(['S', 'K', 'F', 'ESym'].includes(entry['tag']), 
                 'got weird entry tag ' + entry['tag']);

  elt.addClass('entry-' + entry['tag']);

  switch (entry['tag']) {
    case 'S':
      // | S s -> obj_v "S" s
      elt.append(entry['v']);

      break;

    case 'K':
      // | K k -> Assoc [tag "K"; ("v", json_of_control k)]
      renderControl(info, elt, entry['v']);

      break;

    case 'F':
      // | F -> obj "F"

      elt.append(fieldSep);

      break;

    case 'ESym':
      // | ESym sym -> Assoc [tag "ESym"; ("v", json_of_symbolic sym)]

      renderSymbolicChar(info, elt, entry['v']);

      break;

    default:
      debugger;
  }
};

function renderWords(info, elt, words) {
  console.assert(typeof words === 'object', 'expected words list, got ' + words);
  console.assert('length' in words, 'expected length field for words object, got ' + words);

  elt.addClass('words');

  for (const e of words) {
    let entry = $('<span></span>').appendTo(elt);
    renderEntry(info, entry, e);
  }
};

/* Top-level step/environment rendering *******************************/

function renderExpansionState(info, elt, step) {
  console.assert(typeof step === 'object', 'expected step object, got ' + step);
  console.assert('tag' in step, 'expected tag for step object');
  console.assert(['ExpStart',
                  'ExpExpand','ExpSplit','ExpPath','ExpQuote',
                  'ExpError','ExpDone'].includes(step['tag']),
                 'got weird step tag ' + step['tag']);

  elt.addClass('step-' + step['tag']);

  renderDivider(info);
  const marker = $('<div></div>').addClass('section').appendTo(info);
  const icon = $('<i></i>').addClass('icon').appendTo(marker);
  marker.append(stepName[step['tag']]);
  
  let term = $('<span></span>').addClass('term').appendTo(elt);

  switch (step['tag']) {
    case 'ExpStart':
      // | ExpStart w -> obj_w "Start" w     
      icon.addClass('play');

      var w = $('<span></span>').appendTo(term);
      renderWords(info, w, step['w']);

      break;

    case 'ExpExpand':
      // | ExpExpand (f, w) -> obj_fw "Expand" f w
      icon.addClass('expand');

      var f = $('<span></span>').appendTo(term);
      renderExpandedWords(info, f, step['f']);

      var w = $('<span></span>').appendTo(term);
      renderWords(info, w, step['w']);

      break;

    case 'ExpSplit':
      // | ExpSplit (f) -> obj_f "Split" f
      icon.addClass('unlinkify');

      var f = $('<span></span>').appendTo(term);
      renderExpandedWords(info, f, step['f']);

      break;

    case 'ExpPath':
      // | ExpPath ifs -> Assoc [tag "ExpPath"; ("ifs", json_of_intermediate_fields ifs)]
      icon.addClass('disk outline');

      var ifs = $('<span></span>').appendTo(term);
      renderIntermediateFields(info, ifs, step['ifs']);

      break;

    case 'ExpQuote':
      // | ExpQuote ifs -> Assoc [tag "ExpQuote"; ("ifs", json_of_intermediate_fields ifs)]
      icon.addClass('quote right');

      var ifs = $('<span></span>').appendTo(term);
      renderIntermediateFields(info, ifs, step['ifs']);

      break;

    case 'ExpError':
      // | ExpError (f) -> Assoc [tag "Error"; ("msg", json_of_fields f)]
      icon.addClass('warning circle');

      var f = $('<span></span>').appendTo(term);
      renderFields(info, f, step['msg']);

      break;

    case 'ExpDone':
      // | ExpDone fs -> Assoc [tag "Done"; ("f", json_of_fields fs)]
      icon.addClass('check circle outline');

      var f = $('<span></span>').appendTo(term);
      renderFields(info, f, step['f']);

      break;

    default:
      debugger;
  };
};

function renderEnv(info, elt, env) {
  console.assert(typeof env === 'object', 'expected environment object, got ' + env);

  let table = $('<table></table>').addClass('ui unstackable compact table').appendTo(elt);
  let header = $(table).append('<tr><th>Variable</th><th>Value</th></tr>');

  for (const x in env) {
    if (env.hasOwnProperty(x)) {
      let entry = $('<tr></tr>').appendTo(table);

      let varname = $('<td></td>').appendTo(entry);
      varname.append(x);

      let value = $('<td></td>').appendTo(entry);
      renderSymbolicString(info, value, env[x]);
    }
  }
};

function renderDivider(info) {
    $('<i></i>').addClass('right chevron icon divider').appendTo(info);
}

function stepMessage(msg) {
  return msg === '' ? '' : ': ' + msg;
}

function renderMessage(info, desc, step) {
  const crumb = $('<div></div>').addClass('section').appendTo(info)
  crumb.append(desc + stepMessage(step['msg']));
}


function renderExpansionStep(info, step) {
  console.assert(typeof step === 'object', 'expected step object, got ' + step);
  console.assert('tag' in step, 'expected tag for step object');
  console.assert(['ESTilde', 'ESParam', 'ESCommand', 'ESArith', 'ESSplit', 'ESPath',
                  'ESQuote', 'ESStep', 'ESNested', 'ESEval'].includes(step['tag']),
                 'got weird step tag ' + step['tag']);

  switch (step['tag']) {
    case 'ESTilde':
      // | ESTilde s -> Assoc [tag "ESTilde"; ("msg", String s)]
  
      renderMessage(info, 'Tilde expansion', step);

      break;

    case 'ESParam':
      // | ESParam s -> Assoc [tag "ESParam"; ("msg", String s)]

      renderMessage(info, 'Parameter expansion', step);
    
      break;

    case 'ESCommand':
      // | ESCommand s -> Assoc [tag "ESCommand"; ("msg", String s)]

      renderMessage(info, 'Command substitution', step);
      
      break;

    case 'ESArith':
      // | ESArith s -> Assoc [tag "ESArith"; ("msg", String s)]
  
      renderMessage(info, 'Arithmetic expansion', step);

      break;

    case 'ESSplit':
      // | ESSplit s -> Assoc [tag "ESSplit"; ("msg", String s)]
    
      renderMessage(info, 'Field splitting', step);

      break;

    case 'ESPath':
      // | ESPath s -> Assoc [tag "ESPath"; ("msg", String s)]
      
      renderMessage(info, 'Pathname expansion', step);

      break;

    case 'ESQuote':
      // | ESQuote s -> Assoc [tag "ESQuote"; ("msg", String s)]
  
      renderMessage(info, 'Quote removal', step);

      break;

    case 'ESStep':
      // | ESStep s -> Assoc [tag "ESStep"; ("msg", String s)]

      if (step['msg'] !== '') {
          renderMessage(info, 'Expansion step', step);
      }

      break;

    case 'ESNested':
      // | ESNested (outer, inner) -> Assoc [tag "ESNested"; ("inner", json_of_expansion_step inner); ("outer", json_of_expansion_step outer)]
  
      renderExpansionStep(info, step['outer']);
      renderDivider(info);
      renderExpansionStep(info, step['inner']);
      
      break;

    case 'ESEval':
      // | ESEval (exp_step, eval_step) ->  Assoc [tag "ESExpand"; ("inner", json_of_evaluation_step eval_step); ("outer", json_of_expansion_step exp_step)]
  
      renderExpansionStep(info, step['outer']);
      renderDivider(info);
      renderEvaluationStep(info, step['inner']);
      
      break;

    default:
      debugger;
  }
}

function renderExpansionTraceEntry(info, elt, step) {
  console.assert(typeof step === 'object', 'expected step object, got ' + step);
  console.assert('term' in step, 'expected term for step object');
  console.assert('env' in step, 'expected environment for step object');
  console.assert('step' in step, 'expected step description for step object');

  // TODO debug display
  renderExpansionStep(info, step['step']);

  let term = $('<div></div>').addClass('term').appendTo(elt);
  renderExpansionState(info, term, step['term']);

  let env = $('<div></div>').addClass('env').appendTo(elt);
  renderEnv(info, env, step['env']);

};

function renderEvaluationStep(info, step) {
  console.assert(typeof step === 'object', 'expected step object, got ' + step);
  console.assert('tag' in step, 'expected tag for step object');
  console.assert(['XSSimple', 'XSPipe', 'XSRedir', 'XSBackground', 'XSSubshell',
                  'XSAnd', 'XSOr', 'XSNot', 'XSSemi', 'XSIf', 'XSWhile',
                  'XSFor', 'XSCase', 'XSDefun', 'XSStack', 'XSStep', 'XSProc',
                  'XSExec', 'XSWait', 'XSNested', 'XSExpand'].includes(step['tag']),
                 'got weird step tag ' + step['tag']);

  switch (step['tag']) {
    case 'XSSimple':

      renderMessage(info, 'Simple commmand', step);

      break;

    case 'XSPipe':

      renderMessage(info, 'Pipe commmand', step);

      break;

    case 'XSRedir':

      renderMessage(info, 'Redirection', step);

      break;

    case 'XSBackground':

      renderMessage(info, 'Background', step);

      break;

    case 'XSSubshell':

      renderMessage(info, 'Subshell', step);

      break;

    case 'XSAnd':

      renderMessage(info, 'And', step);

      break;

    case 'XSOr':

      renderMessage(info, 'Or', step);

      break;

    case 'XSNot':

      renderMessage(info, 'Not', step);

      break;

    case 'XSSemi':

      renderMessage(info, 'Semi', step);

      break;

    case 'XSIf':

      renderMessage(info, 'If', step);
    
      break;

    case 'XSWhile':

      renderMessage(info, 'While', step);

      break;

    case 'XSFor':

      renderMessage(info, 'For', step);

      break;

    case 'XSCase':

      renderMessage(info, 'Case statement', step);

      break;

    case 'XSDefun':

      renderMessage(info, 'Function definition', step);

      break;

    case 'XSStack':

      info.append(step['func'])
      renderDivider(info);
      renderEvaluationStep(info, step['inner']);

      break;

    case 'XSStep':
      if (step['msg'] !== '') {
        renderMessage(info, 'Evaluation step', step);
      }

      break;

    case 'XSProc':
      renderMessage(info, 'Process step', step);

      break;

    case 'XSExec':
      renderMessage(info, 'Exec', step);

      break;

    case 'XSWait':
      renderMessage(info, 'Wait', step);

      break;

    case 'XSNested':

      renderEvaluationStep(info, step['outer']);
      renderDivider(info);
      renderEvaluationStep(info, step['inner']);

      break;

    case 'XSExpand':

      renderEvaluationStep(info, step['outer']);
      renderDivider(info);
      renderExpansionStep(info, step['inner']);

      break;

    default:
      debugger;
  }
}

function renderEvaluationTraceEntry(info, elt, step) {
  console.assert(typeof step === 'object', 'expected step object, got ' + step);
  console.assert('term' in step, 'expected term for step object');
  console.assert('env' in step, 'expected environment for step object');
  console.assert('step' in step, 'expected step description for step object');

  renderEvaluationStep(info, step['step']);

  let term = $('<div></div>').addClass('term').appendTo(elt);
  renderStmt(info, term, step['term']);

  let env = $('<div></div>').addClass('env').appendTo(elt);
  renderEnv(info, env, step['env']);

};

/**********************************************************************/
/* Handlers ***********************************************************/
/**********************************************************************/

/**
 * Handle expansion: makes the AJAX request for expansion and calls
 * the various rendering functions.
 *
 * By default, it will clear any existing expansion.
 */
// Submit the expansion form
$('#expansionForm').submit(function(e) {
  var url = '/stepper';

  var orNone = function(maybeString) {
    if(maybeString === undefined) {
      return 'None';
    } else {
      return maybeString;
    }
  }
  
  var populateResults = function(data) {
    let result = $('#submit-result');
    result.empty();
    result.addClass('ui container');

    $('<h3>Symbolic expansion steps:</h3>').addClass('ui header').appendTo(result);

    let steps = $('<div></div>').addClass('ui segments').appendTo(result);

    console.log(data);

    for(var i = 0; i < data.length; i++) {
      var step = data[i];

      const hasError = 'error' in step;

      const hasStep = 
            'step' in step &&
            step['step']['tag'] !== 'XSStep' && 
            step['step']['msg'] !== "";

      if (hasStep) {
          console.info('%d: term %o env %o step %o', 
                       i, step['term'], step['env'], step['step']);
      }

      const stepColor = hasError ? 'red' : 'pink';

      const info = 
            hasError || hasStep 
            ? $('<div></div>').addClass('ui segment tertiary inverted ' + stepColor + ' step').appendTo(steps)
            : $('<span></span>');
      const crumb = $('<div></div>').addClass('ui breadcrumb').appendTo(info);

      const elt = $('<div></div>').addClass('evaluation-step ui segment').appendTo(steps);      
      if (hasError) {
          $('<i></i>').addClass('thumbs down icon divider').appendTo(crumb);
          crumb.append('Parse error');

          elt.addClass('error');
          elt.append(step.error);
      } else {
          renderEvaluationTraceEntry(crumb, elt, step);
      }
    }
  }

  $.ajax({
    type: 'POST',
    url: url,
    data: $('#expansionForm').serialize(),
    success: function(data) {
      populateResults(JSON.parse(data))
    },
  });

  e.preventDefault();
});

/**
 * Clears any existing expansion.
 */
$('#clear').click(function (e) {
  $('#submit-result').empty();
});