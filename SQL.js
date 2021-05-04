'use strict'
const inspect = Symbol.for('nodejs.util.inspect.custom')
const unsafe = Symbol('unsafe')

const QUOTE = '"'

class SqlStatement {
  constructor (strings, values) {
    if (values.some(value => value === undefined)) {
      throw new Error(
        'SQL`...` strings cannot take `undefined` as values as this can generate invalid sql.'
      )
    }
    this.strings = strings
    this._values = values
  }

  glue (pieces, separator) {
    const result = { strings: [], values: [] }

    let carryover
    for (let i = 0; i < pieces.length; i++) {
      const strings = Array.from(pieces[i].strings)
      if (typeof carryover === 'string') {
        strings[0] = carryover + separator + strings[0]
        carryover = null
      }

      if (strings.length > pieces[i].values.length) {
        carryover = strings.splice(-1)[0]
      }
      result.strings.push.apply(result.strings, strings)
      result.values.push.apply(result.values, pieces[i].values)
    }
    if (typeof carryover === 'string') {
      result.strings.push(carryover)
    }

    if (result.strings.length === result.values.length) {
      result.strings.push('')
    }

    result.strings[result.strings.length - 1] += ' '

    return new SqlStatement(result.strings, result.values)
  }

  generateString (type) {
    let text = this.strings[0]
    let valueOffset = 0
    const values = [...this._values]

    for (let i = 1; i < this.strings.length; i++) {
      if (values[i - 1 + valueOffset] && values[i - 1 + valueOffset][unsafe]) {
        text += `${QUOTE}${values[i - 1 + valueOffset].value}${QUOTE}${
          this.strings[i]
        }`
        values.splice(i - 1 + valueOffset, 1)
        valueOffset--
      } else {
        let delimiter = '?'
        if (type === 'pg') {
          delimiter = '$' + (i + valueOffset)
        }

        text += delimiter + this.strings[i]
      }
    }

    return text.replace(/\s+$/gm, ' ').replace(/^\s+|\s+$/gm, '')
  }

  get debug () {
    let text = this.strings[0]

    for (let i = 1; i < this.strings.length; i++) {
      let data = this._values[i - 1]
      let quote = "'"
      if (data && data[unsafe]) {
        data = data.value
        quote = '"'
      }
      typeof data === 'string' ? (text += quote + data + quote) : (text += data)
      text += this.strings[i]
    }

    return text.replace(/\s+$/gm, ' ').replace(/^\s+|\s+$/gm, '')
  }

  [inspect] () {
    return `SQL << ${this.debug} >>`
  }

  get text () {
    return this.generateString('pg')
  }

  get sql () {
    return this.generateString('mysql')
  }

  get values () {
    return this._values.filter(v => !v || !v[unsafe])
  }

  append (statement, options) {
    if (!statement) {
      return this
    }

    if (!(statement instanceof SqlStatement)) {
      throw new Error(
        '"append" accepts only template string prefixed with SQL (SQL`...`)'
      )
    }

    if (options && options.unsafe === true) {
      const text = statement.strings.reduce((acc, string, i) => {
        acc = `${acc}${string}${statement.values[i] ? statement.values[i] : ''}`
        return acc
      }, '')

      const strings = this.strings.slice(0)
      strings[this.strings.length - 1] += text

      this.strings = strings

      return this
    }

    const last = this.strings[this.strings.length - 1]
    const [first, ...rest] = statement.strings

    this.strings = [...this.strings.slice(0, -1), last + first, ...rest]

    this._values.push.apply(this._values, statement._values)

    return this
  }
}

function SQL (strings, ...values) {
  return new SqlStatement(strings, values)
}

SQL.glue = SqlStatement.prototype.glue

module.exports = SQL
module.exports.SQL = SQL
module.exports.default = SQL
module.exports.unsafe = value => ({
  value,
  [unsafe]: true
})
