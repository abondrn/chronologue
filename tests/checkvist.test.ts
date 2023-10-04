import { durationEstimateToMinutes, dueDate, hasDueDate, hasSubtasks, permalink } from '../src/checkvist';


const taskWithEstimate = (est: string = 'unrelated-task', due: string | null = null) => {
    return {
        id: 61713888,
        parent_id: 61647982,
        checklist_id: 878485,
        status: 0,
        position: 6,
        tasks: [],
        update_line: 'tags changed by abondrn',
        updated_at: '2023/10/04 02:10:46 +0000',
        created_at: '2023/09/21 21:05:11 +0000',
        due,
        content: 'very important work',
        collapsed: false,
        comments_count: 0,
        assignee_ids: [],
        details: {},
        backlink_ids: [],
        link_ids: [],
        tags: { [est]: false },
        tags_as_text: est,
    }
};


describe('test parsing utilities', () => {

  test('should parse estimates with minutes hours and days', () => {
    expect(durationEstimateToMinutes(taskWithEstimate('15m'))).toBe(15);
    expect(durationEstimateToMinutes(taskWithEstimate('3h'))).toBe(3*60);
    expect(durationEstimateToMinutes(taskWithEstimate('8d'))).toBe(8*8*60);
  });

  test('should handle missing estimate', () => {
    expect(durationEstimateToMinutes(taskWithEstimate())).toBe(null);
  });

  test('should handle due dates', () => {
    expect(dueDate(taskWithEstimate('', '2023/10/03'))).toStrictEqual(new Date(2023, 10, 3));
  });

  test('should handle missing due dates', () => {
    expect(dueDate(taskWithEstimate())).toBe(null);
  });

});


describe('test task utilities', () => {

    test('should know if tasks have due dates', () => {
        expect(hasDueDate(taskWithEstimate())).toBe(false);
        expect(hasDueDate(taskWithEstimate('', '2023/10/03'))).toBe(true);
    });

    test('should know if tasks have subtasks', () => {
        expect(hasSubtasks(taskWithEstimate())).toBe(false);
    });

    test('should generate permalinks', () => {
        expect(permalink(taskWithEstimate())).toBe('https://checkvist.com/checklists/878485/tasks/61713888');
    });

});