import { parse } from '../src/template-parser';


describe('test parser', () => {
    test('should parse filters', () => {
        const parsed = parse('{{ var | filter 1, 2, c=3, c=4 }}');
        expect(parsed.length).toBe(1);
        expect(parsed[0].type).toBe('expr');
    });

    test('should parse simple paths', () => {
        const parsed = parse('before $a.b[0] after');
        console.log(parsed);
    });

    test('should parse calls', () => {
        const parsed = parse('{{ call a, b=c }}');
        console.log(parsed);
    });

    test('should parse ints', () => {
        const parsed = parse('{{ 1 }}');
        console.log(parsed);
    });

    test('should parse strings', () => {
        const parsed = parse(" {{ 'yes' }} ");
        console.log(parsed);
    });

    test('should parse complex paths', () => {
        const parsed = parse('{{ root .key [ var ] }}');
        console.log(parsed);
    });
});