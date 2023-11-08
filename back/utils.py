

def best_alignment(correct, bugged):
    ''' Computes best alignment between two sequences (edit distance).
        The result is dynamic programming matrix 
    '''
    D = [[(0, 'end') for j in range(len(bugged) + 1)] for i in range(len(correct) + 1)]
    for i in range(1, len(correct) + 1):
        D[i][0] = (D[i-1][0][0] + 1, 'group-correct')
    for j in range(1, len(bugged) + 1):
        D[0][j] = (D[0][j-1][0] + 1, 'group-bugged')
    for i in range(1, len(correct) + 1):
        for j in range(1, len(bugged) + 1):
            if correct[i] == bugged[j]:
                D[i][j] = (D[i-1][j-1][0], 'same')
            else:
                possibilities = [ (D[i][j - 1][0], 'group-bugged'), (D[i - 1][j][0], 'group-correct'), (D[i - 1][j - 1][0], 'group-both')]
                w, act = min(possibilities, key = lambda x: x[0])
                w0 = 2 if act == 'group-both' else 1 
                D[i][j] = (w + w0, act)
    d, _ = D[-1][-1]
    correct_fragments = []
    bugged_fragments = []
    i = len(correct)
    j = len(bugged)
    while D[i][j][1] != 'end':
        if D[i][j][1] == 'same':
            correct_fragments.append(correct[i])
            i = i - 1 
            j = j - 1 

if __name__ == "__main__":
    ''' Testing utils in online mode '''

    code = "def sum_numbers(numbers):\n    total = 0\n    for number in numbers:\n        total += number\n    return total"
    bugged = "def sum_numbers(numbers):\n    total = 1\n    for number in numbers:\n        total += number\n    return total"

    best_alignment(code, bugged)
    
