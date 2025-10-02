import { TypedLiteral } from './TypedLiteral.js';

export class TypedIntervalLiteral extends TypedLiteral {

    /* SYNTAX RULES */

    static get syntaxRules() {
        return [
            { type: 'data_type', as: 'data_type', value: 'INTERVAL' },
            {
                syntaxes: [
                    { type: 'string_literal', as: 'value' },
                    { type: 'number_literal', as: 'value', dialect: 'mysql' },
                ]
            },
            {
                optional: true,
                syntax: [
                    { type: 'keyword', as: 'unit', value: ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'] },
                    {
                        optional: true,
                        syntax: [
                            { type: 'keyword', value: 'TO' },
                            { type: 'keyword', as: 'to_unit', value: ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'], assert: true },
                        ]
                    },
                ]
            },
        ];
    }

    /* AST API */

    unit() { return this._get('unit'); }

    toUnit() { return this._get('to_unit'); }

    /**
     * Parse a Postgres/MySQL-style INTERVAL literal into component parts.
     * Returns an object like { years, months, days, hours, minutes, seconds }
     */
    parseInterval() {
        const val = this._get('value');
        if (!val) return {};

        let str = '';
        if (val.type === 'string_literal') {
            str = val.value.toString().trim();
        } else if (val.type === 'number_literal') {
            // MySQL form: INTERVAL 3 HOUR
            const num = val.value;
            const unit = (this.unit() || '').toUpperCase();
            return this.#unitToParts(num, unit);
        }

        const sign = str.startsWith('-') ? -1 : 1;
        if (sign === -1) str = str.slice(1).trim();

        const parts = { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };

        const unit = this.unit() ? this.unit().toUpperCase() : null;
        const toUnit = this.toUnit() ? this.toUnit().toUpperCase() : null;

        // ----- Handle ranges -----
        if (unit && toUnit) {
            const range = `${unit} TO ${toUnit}`;

            switch (range) {
                case 'YEAR TO MONTH': {
                    const [y, m] = str.split('-').map(Number);
                    parts.years = y;
                    parts.months = m;
                    return this.#applySign(parts, sign);
                }
                case 'DAY TO HOUR': {
                    const [d, h] = str.split(/\s+/);
                    parts.days = Number(d);
                    parts.hours = Number(h);
                    return this.#applySign(parts, sign);
                }
                case 'DAY TO MINUTE': {
                    const [d, hm] = str.split(/\s+/);
                    parts.days = Number(d);
                    const [h, m] = hm.split(':').map(Number);
                    parts.hours = h;
                    parts.minutes = m;
                    return this.#applySign(parts, sign);
                }
                case 'DAY TO SECOND': {
                    const [d, hms] = str.split(/\s+/);
                    parts.days = Number(d);
                    const [h, m, s] = hms.split(':').map(Number);
                    parts.hours = h;
                    parts.minutes = m;
                    parts.seconds = s;
                    return this.#applySign(parts, sign);
                }
                case 'HOUR TO MINUTE': {
                    const [h, m] = str.split(':').map(Number);
                    parts.hours = h;
                    parts.minutes = m;
                    return this.#applySign(parts, sign);
                }
                case 'HOUR TO SECOND': {
                    const [h, m, s] = str.split(':').map(Number);
                    parts.hours = h;
                    parts.minutes = m;
                    parts.seconds = s;
                    return this.#applySign(parts, sign);
                }
                case 'MINUTE TO SECOND': {
                    const [m, s] = str.split(':').map(Number);
                    parts.minutes = m;
                    parts.seconds = s;
                    return this.#applySign(parts, sign);
                }
            }
        }

        // ----- Fallback: general composite parsing -----
        const tokens = str.split(/\s+/);

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            // Time literal HH:MM:SS(.FFF)
            if (/^\d{1,2}:\d{1,2}(:\d{1,2}(\.\d+)?)?$/.test(token)) {
                const [h, m, s] = token.split(':').map(Number);
                if (!isNaN(h)) parts.hours += h;
                if (!isNaN(m)) parts.minutes += m;
                if (!isNaN(s)) parts.seconds += s;
                continue;
            }

            const num = parseFloat(token);
            if (!isNaN(num)) {
                const u = (tokens[i + 1] || '').toUpperCase();
                if (u) {
                    const mapped = this.#unitToParts(num, u);
                    for (const [k, v] of Object.entries(mapped)) parts[k] += v;
                    i++;
                }
            }
        }

        return this.#applySign(parts, sign);
    }

    #unitToParts(num, unit) {
        const parts = {};
        switch (unit) {
            case 'YEAR': parts.years = num; break;
            case 'MONTH': parts.months = num; break;
            case 'DAY': parts.days = num; break;
            case 'HOUR': parts.hours = num; break;
            case 'MINUTE': parts.minutes = num; break;
            case 'SECOND': parts.seconds = num; break;
            default: break;
        }
        return parts;
    }

    #applySign(parts, sign) {
        for (const k of Object.keys(parts)) {
            parts[k] *= sign;
        }
        return parts;
    }

    /**
     * Apply interval to a base date.
     */
    applyToDate(baseDate, dir = 'FOLLOWING') {
        const parts = this.parseInterval();
        const d = new Date(baseDate);
        const sign = dir === 'FOLLOWING' ? 1 : -1;

        if (parts.years) d.setFullYear(d.getFullYear() + sign * parts.years);
        if (parts.months) d.setMonth(d.getMonth() + sign * parts.months);
        if (parts.days) d.setDate(d.getDate() + sign * parts.days);
        if (parts.hours) d.setHours(d.getHours() + sign * parts.hours);
        if (parts.minutes) d.setMinutes(d.getMinutes() + sign * parts.minutes);
        if (parts.seconds) d.setSeconds(d.getSeconds() + sign * parts.seconds);

        return d.getTime();
    }
}