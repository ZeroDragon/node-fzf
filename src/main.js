const keypress = require( 'keypress' )
const ttys = require( 'ttys' )

const stdin = ttys.stdin
const stdout = ttys.stdout

const stringWidth = require( 'string-width' )

const clc = require( 'cli-color' )

module.exports = start

function start ( opts, callback )
{
  if ( Array.isArray( opts ) ) {
    opts = {
      list: opts,
      mode: 'fzf'
    }
  }

  const promise = new Promise( function ( resolve, reject ) {
    const _api = {}

    let originalList = opts.list || []
    let _list = prepareList( originalList )

    let _input = ''

    _api.update = function ( list ) {
      originalList = list
      _list = prepareList( originalList )
      render()
    }

    _api.stop = stop

    function prepareList ( newList ) {
      const list = newList.map( function ( value, index ) {
        return {
          originalValue: value, // text
          originalIndex: index
        }
      } )
      return list
    }

    function stop () {
      stdin.removeListener( 'keypress', handleKeypress )

      stdin.setRawMode && stdin.setRawMode( false )
      stdin.pause()
    }

    // make `process.stdin` begin emitting "keypress" events
    keypress( stdin )

    // selected index relative to currently matched results
    // (filtered subset of _list)
    let selectedIndex = 0

    // input buffer
    let buffer = ''

    // input cursor position ( only horizontal )
    // relative to input buffer
    let cursorPosition = 0

    // number of items printed on screen, usually ~7
    let _printedMatches = 0

    let _matches = []
    let _selectedItem

    const MIN_HEIGHT = 6

    function getMaxWidth () {
      return clc.windowSize.width - 7
    }

    const debug = false

    function handleKeypress ( chunk, key ) {
      debug && console.log( 'chunk: ' + chunk )

      key = key || { name: '' }

      const name = String( key.name )

      debug && console.log( 'got "keypress"', key )

      if ( key && key.ctrl && name === 'c' ) {
        cleanDirtyScreen()
        return stop()
      }

      if ( key && key.ctrl && name === 'z' ) {
        cleanDirtyScreen()
        return stop()
      }

      if ( key && key.ctrl && name === 'l' ) {
        // return stdout.write( clc.reset )
      }

      const view_height = _printedMatches ? _printedMatches : 10

      if ( key.ctrl ) {
        switch ( name ) {
          case 'h': // backspace
            // ignore
            break

          case 'b': // jump back 1 word
            {
              const slice = buffer.slice( 0, cursorPosition )
              const m = slice.match( /\S+\s*$/ ) // last word
              if ( m && m.index > 0 ) {
                // console.log( m.index )
                cursorPosition = m.index
              } else {
                cursorPosition = 0
              }
            }
            return render()
            break

          case 'j': // down
          case 'n': // down
            selectedIndex += 1
            return render()
            break
          case 'k': // up
          case 'p': // up
            selectedIndex -= 1
            return render()
            break

          case 'l': // right
            // ignore
            break

          case 'f': // jump forward 1 word
            {
              const slice = buffer.slice( cursorPosition )
              const m = slice.match( /^\S+\s*/ ) // first word
              if ( m && m.index >= 0 && m[ 0 ] && m[ 0 ].length >= 0 ) {
                // console.log( m.index )
                cursorPosition += ( m.index + m[ 0 ].length )
              } else {
                cursorPosition = buffer.length
              }
            }
            return render()
            break

          case 'd': // down
            // basically intended as page-down
            selectedIndex += view_height
            return render()
            break

          case 'u': // up
            // basically intended as page-up
            selectedIndex -= view_height
            return render()
            break

          case 'a': // beginning of line
            cursorPosition = 0
            return render()
            break

          case 'e': // end of line
            cursorPosition = buffer.length
            return render()
            break

          case 'w': // clear word
            {
              const a = buffer.slice( 0, cursorPosition )
              const b = buffer.slice( cursorPosition )
              const m = a.match( /\S+\s*$/ ) // last word
              if ( m && m.index > 0 ) {
                // console.log( m.index )
                cursorPosition = m.index
                buffer = a.slice( 0, cursorPosition ).concat( b )
              } else {
                cursorPosition = 0
                buffer = b
              }
            }
            return render()
            break

          case 'q': // quit
            cleanDirtyScreen()
            return stop()
            break
        }
      }

      if ( key.ctrl ) return
      if ( key.meta ) return

      switch ( name ) {
        case 'backspace': // ctrl-h
          {
            const a = buffer.slice( 0, cursorPosition - 1 )
            const b = buffer.slice( cursorPosition )
            buffer = a.concat( b )

            cursorPosition--
            if ( cursorPosition < 0 ) {
              cursorPosition = 0
            }
          }
          return render()
          break

        case 'left': // left arrow key
          cursorPosition--
          if ( cursorPosition < 0 ) cursorPosition = 0
          return render()
          break

        case 'right': // right arrow key
          cursorPosition++
          if ( cursorPosition > buffer.length ) {
            cursorPosition = buffer.length
          }
          return render()
          break

        // text terminals treat ctrl-j as newline ( enter )
        // ref: https://ss64.com/bash/syntax-keyboard.html
        case 'down': // ctrl-j
        case 'enter':
          selectedIndex += 1
          return render()
          break

        case 'up':
          selectedIndex -= 1
          return render()
          break

        case 'esc':
        case 'escape':
          cleanDirtyScreen()
          return stop()
          break

        // hit return key ( aka enter key ) ( aka ctrl-m )
        case 'return': // ctrl-m
          cleanDirtyScreen()
          stop()

          function transformResult ( match ) {
            // match object format
            // results.push( {
            //   originalIndex: originalIndex,
            //   matchedIndex: results.length,
            //   original: item,
            //   text: t // what shows up on terminal/screen
            // } )

            return {
              value: match.originalValue,
              index: match.originalIndex,
              // matchedIndex: match.matchedIndex,
              // toString: function () {
              //   return match.original
              // }
            }
          }

          const result = {
            selected: _selectedItem && transformResult( _selectedItem ) || undefined,
            // matches: _matches.map( transformResult ),
            // list: _list.slice(),
            query: buffer
          }

          if ( callback ) {
            callback( result )
          }

          resolve( result )

          return
          break
      }

      if ( chunk && chunk.length === 1 ) {
        let c = ''
        if ( key.shift ) {
          c = chunk.toUpperCase()
        } else {
          c = chunk
        }

        if ( c ) {
          const a = buffer.slice( 0, cursorPosition )
          const b = buffer.slice( cursorPosition )
          buffer = a.concat( c, b )

          cursorPosition++
          if ( cursorPosition > buffer.length ) {
            cursorPosition = buffer.length
          }
        }

        render()
      }
    }

    stdin.setEncoding( 'utf8' )
    stdin.on( 'keypress', handleKeypress )

    const clcBgGray = clc.bgXterm( 236 )
    const clcFgArrow = clc.xterm( 198 )
    const clcFgBufferArrow = clc.xterm( 110 )
    const clcFgGreen = clc.xterm( 143 )
    // const clcFgMatchGreen = clc.xterm( 151 )
    const clcFgMatchGreen = clc.xterm( 107 )

    function fuzzyMatch ( fuzz, text )
    {
      // TODO this fn not used anymore?
      const matches = fuzzyMatches( fuzz, text )
      return matches.length === fuzz.length
    }

    // get matches based on the search mode
    function getMatches ( mode, filter, text )
    {
      switch ( mode.trim().toLowerCase() ) {
        case 'word':
        case 'words':
        case 'text':
        case 'normal':
          return textMatches( filter, text )

        case 'fzf':
        case 'fuzzy':
        default:
          // default to fuzzy matching
          return fuzzyMatches( filter, text )
      }
    }

    // get matched list based on the search mode
    function getList ( mode, filter, list )
    {
      // default to fuzzy matching
      switch ( mode.trim().toLowerCase() ) {
        case 'word':
        case 'words':
        case 'text':
        case 'normal':
          return textList( filter, list )

        case 'fzf':
        case 'fuzzy':
        default:
          // default to fuzzy matching
          return fuzzyList( filter, list )
      }
    }

    function fuzzyMatches ( fuzz, text )
    {
      fuzz = fuzz.toLowerCase()
      text = text.toLowerCase()

      let tp = 0 // text position/pointer
      let matches = []

      // nothing to match with
      if ( !fuzz ) return matches

      for ( let i = 0; i < fuzz.length; i++ ) {
        const f = fuzz[ i ]

        for ( ; tp < text.length; tp++ ) {
          const t = text[ tp ]
          if ( f === t ) {
            matches.push( tp )
            tp++
            break
          }
        }
      }

      return matches
    }

    function fuzzyList ( fuzz, list )
    {
      const results = []

      for ( let i = 0; i < list.length; i++ ) {
        const item = list[ i ]

        const originalIndex = item.originalIndex
        const originalValue = item.originalValue

        // get rid of unnecessary whitespace that only takes of
        // valuable scren space
        const normalizedItem = originalValue.split( /\s+/ ).join( ' ' )

        /* matches is an array of indexes on the normalizedItem string
         * that have matched the fuzz
         */
        const matches = fuzzyMatches( fuzz, normalizedItem )

        if ( matches.length === fuzz.length ) {
          /* When the matches.length is exacly the same as fuzz.length
           * it means we have a fuzzy match -> all characters in
           * the fuzz string have been found on the normalizedItem string.
           * The matches array holds each string index position
           * of those matches on the normalizedItem string.
           * ex. fuzz = 'foo', normalizedItem = 'far out dog', matches = [0,4,9]
           */

          let t = normalizedItem

          results.push( {
            originalIndex: originalIndex,
            originalValue: originalValue,
            matchedIndex: results.length,
            original: item,
            text: t // what shows up on terminal/screen
          } )
        }
      }

      return results
    }

    function textMatches ( filter, text )
    {
      filter = filter.toLowerCase() // ex. foo
      text = text.toLowerCase() // ex. dog food is geat

      let tp = 0 // text position/pointer
      let matches = []

      // nothing to match with
      if ( !filter ) return matches

      // source pointer ( first index of matched text )
      const sp = text.indexOf( filter )
      if ( sp >= 0 ) {
        // end pointer ( last index of matched text )
        const ep = sp + filter.length
        for ( let i = sp; i < ep; i++ ) {
          matches.push( i )
        }
      }

      return matches
    }

    function textList ( filter, list )
    {
      const results = []

      for ( let i = 0; i < list.length; i++ ) {
        const item = list[ i ]

        const originalIndex = item.originalIndex
        const originalValue = item.originalValue

        // get rid of unnecessary whitespace that only takes of
        // valuable scren space
        const normalizedItem = originalValue.split( /\s+/ ).join( ' ' )

        /* matches is an array of indexes on the normalizedItem string
         * that have matched the fuzz
         */
        const matches = textMatches( filter, normalizedItem )

        if ( matches.length === filter.length ) {
          /* When the matches.length is exacly the same as filter.length
           * it means we have a fuzzy match -> all characters in
           * the filter string have been found on the normalizedItem string.
           * The matches array holds each string index position
           * of those matches on the normalizedItem string.
           * ex. filter = 'foo', normalizedItem = 'dog food yum', matches = [4,5,6]
           */

          let t = normalizedItem

          results.push( {
            originalIndex: originalIndex,
            originalValue: originalValue,
            matchedIndex: results.length,
            original: item,
            text: t // what shows up on terminal/screen
          } )
        }
      }

      return results
    }

    function colorIndexesOnText ( indexes, text, clcColor ) {
      const paintBucket = [] // characters to colorize at the end

      for ( let i = 0; i < indexes.length; i++ ) {
        const index = indexes[ i ]
        paintBucket.push( { index: index, clc: clcFgMatchGreen || clcColor } )
      }

      // copy match text colorize it based on the matches
      // this variable with the colorized ANSI text will be
      // returned at the end of the function
      let t = text

      let len = stringWidth( t ) // use string-width to keep length in check
      const maxLen = getMaxWidth() // terminal width

      /* we want to show the user the last characters that matches
       * as those are the most relevant
       * ( and ignore earlier matches if they go off-screen )
       *
       * use the marginRight to shift the matched text left until
       * the last characters that match are visible on the screen
       */
      const lastMatchIndex = indexes[ indexes.length - 1 ]
      const marginRight = Math.ceil( clc.windowSize.width * 0.4 )

      let matchMarginRight = ( lastMatchIndex + marginRight )

      // but don't shift too much
      if ( matchMarginRight > ( len + 8 ) ) matchMarginRight = ( len + 8 )

      const shiftRight = ( maxLen - matchMarginRight )
      let shiftAmount = 0
      let startIndex = 0
      let endIndex = len

      if ( shiftRight < 0 ) {
        // we need to shift so that the matched text and margin is in view
        shiftAmount = -shiftRight
        t = '...' + t.slice( shiftAmount )

        startIndex = 3
      }

      /* Cut off from the end of the (visual) line until
       * it fits on the terminal width screen.
       */
      len = stringWidth( t )
      if ( len > maxLen ) {
        let attempts = 0
        while ( len > maxLen ) {
          t = t.slice( 0, maxLen - attempts++ )

          // re-calculate terminal/visual width
          len = stringWidth( t )
        }
        t += '...'

        endIndex = len
      }

      // colorise in reverse because invisible ANSI color
      // characters increases string length
      paintBucket.sort( function ( a, b ) {
        return b.index - a.index
      } )

      for ( let i = 0; i < paintBucket.length; i++ ) {
        const paint = paintBucket[ i ]
        const index = paint.index - shiftAmount + startIndex

        // skip fuzzy chars that have shifted out of view
        if ( index < startIndex ) continue
        if ( index > endIndex ) continue

        const c = paint.clc( t[ index ] )
        t = t.slice( 0, index ) + c + t.slice( index + 1 )
      }

      // return the colorized match text
      return t
    }

    function cleanDirtyScreen ()
    {
      const width = clc.windowSize.width
      const writtenHeight = Math.max(
        MIN_HEIGHT,
        2 + _printedMatches
      )

      stdout.write( clc.move( -width ) )

      for ( let i = 0; i < writtenHeight; i++ ) {
        stdout.write( clc.erase.line )
        stdout.write( clc.move.down( 1 ) )
      }

      stdout.write( clc.move.up( writtenHeight ) )
    }

    function render ()
    {
      const width = clc.windowSize.width
      const height = clc.windowSize.height
      // console.log( 'window height: ' + height )
      // !debug && stdout.write( clc.erase.screen )
      // stdout.write( clc.move.to( 0, height ) )

      cleanDirtyScreen()

      // calculate matches
      _matches = [] // reset matches
      const words = buffer.split( /\s+/ )
      for ( let i = 0; i < words.length; i++ ) {
        const word = words[ i ]
        let list = _list // fuzzy match against all items in list
        if ( i > 0 ) {
          // if we already have matches, fuzzy match against
          // those instead (combines the filters)
          list = _matches
        }
        const matches = getList( opts.mode, word, list )
        _matches = matches
      }

      if ( selectedIndex >= _matches.length ) {
        // max out at end of filtered/matched results
        selectedIndex = _matches.length - 1
      }

      if ( selectedIndex < 0 ) {
        // min out at beginning of filtered/matched results
        selectedIndex = 0
      }

      // print buffer arrow
      stdout.write( clcFgBufferArrow( '> ' ) )
      stdout.write( buffer )
      stdout.write( '\n' )

      /* Here we color the matched items text for terminal
       * printing based on what characters were found/matched.
       *
       * Since each filter is separated by space we first
       * combine all matches from all filters(words).
       *
       * If we want to only color based on the most recent
       * filter (last word) then just use the matches from the
       * last word.
       */
      for ( let i = 0; i < _matches.length; i++ ) {
        const match = _matches[ i ]

        const words = buffer.split( /\s+/ )
        let indexMap = {} // as map to prevent duplicates indexes
        for ( let i = 0; i < words.length; i++ ) {
          const word = words[ i ]
          const matches = getMatches( opts.mode, word, match.text )
          matches.forEach( function ( i ) {
            indexMap[ i ] = true
          } )
        }

        const indexes = Object.keys( indexMap )
        indexes.sort() // sort indexes

        // transform the text to a colorized version
        match.text = colorIndexesOnText( indexes, match.text /*, clcFgGreen */ )
      }

      // print matches
      const n = _matches.length
      stdout.write( '  ' )
      stdout.write( clcFgGreen( n + '/' + _list.length ) )
      stdout.write( '\n' )

      // select first item in list by default ( empty fuzzy search matches first
      // item.. )
      if ( !_selectedItem ) {
        _selectedItem = _matches[ 0 ]
      }

      _printedMatches = 0

      // max lines to use for printing matched results
      const maxPrintedLines = Math.min( _matches.length, MIN_HEIGHT )

      let paddingBottom = 2 // 1 extra padding at the bottom when scrolling down
      if ( _matches.length <= MIN_HEIGHT ) {
        // no extra padding at the bottom since there is no room for it
        // - othewise first match is cut off and will not be visible
        paddingBottom = 1
      }

      // first matched result to print
      const startIndex = Math.max( 0, selectedIndex - maxPrintedLines + paddingBottom )

      // last matched result to print
      const endIndex = Math.min( maxPrintedLines + startIndex, _matches.length )

      // print matches
      for ( let i = startIndex; i < endIndex; i++ ) {
        _printedMatches++

        const match = _matches[ i ]

        const item = match.text

        const itemSelected = (
          ( selectedIndex === i )
        )

        if ( itemSelected ) {
          _selectedItem = match
          stdout.write( clcBgGray( clcFgArrow( '> ' ) ) )
          stdout.write( clcBgGray( item ) )
          stdout.write( '\n' )
        } else {
          stdout.write( clcBgGray( ' ' ) )
          stdout.write( ' ' )
          stdout.write( item )
          stdout.write( '\n' )
        }
      }

      if ( _printedMatches < 1 ) {
        // clear selected item when nothing matches
        _selectedItem = undefined
      }

      stdout.write( clc.move.up( 2 + _printedMatches ) )

      // set cursor position to end of buffer
      // stdout.write( clc.move.right( 1 + buffer.length + 1 ) )

      // reset cursor left position
      stdout.write( clc.move( -clc.windowSize.width ) )

      // set cursor left position
      stdout.write( clc.move.right( 2 + cursorPosition ) )
    }

    stdin.setRawMode && stdin.setRawMode( true )
    stdin.resume()

    render()

    return _api
  } )
  return promise
}

// quick debugging, only executes when run with `node main.js`
if ( require.main === module ) {
  ;( async function () {
    const opts = {
      mode: 'normal',
      list: require( '../test/youtube-search-results.json' )
    }
    // const r = await start( require( '../test/animals.json' ) )
    const r = await start( opts )
    console.log( r.selected )
  } )()
}
