const gameBoard = document.getElementById('game-board');
const cells = document.querySelectorAll('.cell');
const resetButton = document.getElementById('reset-button');
let currentPlayer = '🐰';
let boardState = Array(9).fill(null);

const winningCombinations = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
];

function handleClick(event) {
    const cell = event.target;
    const index = cell.getAttribute('data-index');

    if (boardState[index] !== null) return;

    boardState[index] = currentPlayer;
    cell.textContent = currentPlayer;

    if (checkWin()) {
        alert(`${currentPlayer} wins!`);
        resetGame();
        return;
    }

    if (boardState.every(cell => cell !== null)) {
        alert("It's a tie!");
        resetGame();
        return;
    }

    currentPlayer = currentPlayer === '🐰' ? '🐱' : '🐰';
}

function checkWin() {
    return winningCombinations.some(combination => {
        return combination.every(index => {
            return boardState[index] === currentPlayer;
        });
    });
}

function resetGame() {
    boardState.fill(null);
    cells.forEach(cell => cell.textContent = '');
    currentPlayer = '🐰';
}

cells.forEach(cell => cell.addEventListener('click', handleClick));
resetButton.addEventListener('click', resetGame);