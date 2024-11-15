import os
import time
import random
import keyboard
from threading import Thread

class Frogger:
    def __init__(self):
        self.width = 30
        self.height = 15
        self.frog = '🐸'
        self.car = '🚗'
        self.log = '🪵'
        self.water = '💧'
        self.goal = '🏠'
        self.frog_pos = [self.height - 1, self.width // 2]
        self.cars = []
        self.logs = []
        self.score = 0
        self.game_over = False
        
    def init_obstacles(self):
        # Initialize cars
        for i in range(3):
            self.cars.append([5 + i * 2, random.randint(0, self.width-1)])
            self.cars.append([6 + i * 2, random.randint(0, self.width-1)])
        
        # Initialize logs
        for i in range(3):
            self.logs.append([2 + i * 2, random.randint(0, self.width-1)])
            
    def move_obstacles(self):
        # Move cars
        for car in self.cars:
            car[1] = (car[1] + 1) % self.width
            
        # Move logs
        for log in self.logs:
            log[1] = (log[1] - 1) % self.width
            
    def draw(self):
        os.system('cls' if os.name == 'nt' else 'clear')
        board = [[' ' for _ in range(self.width)] for _ in range(self.height)]
        
        # Draw water
        for y in range(2, 8):
            for x in range(self.width):
                board[y][x] = self.water
                
        # Draw cars
        for car in self.cars:
            board[car[0]][car[1]] = self.car
            
        # Draw logs
        for log in self.logs:
            board[log[0]][log[1]] = self.log
            
        # Draw goals
        for x in range(0, self.width, 6):
            board[0][x] = self.goal
            
        # Draw frog
        board[self.frog_pos[0]][self.frog_pos[1]] = self.frog
        
        # Print board
        print(f"Score: {self.score}")
        for row in board:
            print(''.join(row))
            
    def check_collision(self):
        # Check car collision
        for car in self.cars:
            if car[0] == self.frog_pos[0] and car[1] == self.frog_pos[1]:
                self.game_over = True
                
        # Check water collision
        if 2 <= self.frog_pos[0] <= 7:
            on_log = False
            for log in self.logs:
                if log[0] == self.frog_pos[0] and log[1] == self.frog_pos[1]:
                    on_log = True
                    break
            if not on_log:
                self.game_over = True
                
        # Check goal
        if self.frog_pos[0] == 0 and board[0][self.frog_pos[1]] == self.goal:
            self.score += 100
            self.frog_pos = [self.height - 1, self.width // 2]
            
    def move_frog(self, direction):
        if direction == 'up' and self.frog_pos[0] > 0:
            self.frog_pos[0] -= 1
        elif direction == 'down' and self.frog_pos[0] < self.height - 1:
            self.frog_pos[0] += 1
        elif direction == 'left' and self.frog_pos[1] > 0:
            self.frog_pos[1] -= 1
        elif direction == 'right' and self.frog_pos[1] < self.width - 1:
            self.frog_pos[1] += 1

def main():
    game = Frogger()
    game.init_obstacles()
    
    def handle_input():
        while not game.game_over:
            if keyboard.is_pressed('up'):
                game.move_frog('up')
            elif keyboard.is_pressed('down'):
                game.move_frog('down')
            elif keyboard.is_pressed('left'):
                game.move_frog('left')
            elif keyboard.is_pressed('right'):
                game.move_frog('right')
            elif keyboard.is_pressed('q'):
                game.game_over = True
            time.sleep(0.1)
    
    input_thread = Thread(target=handle_input)
    input_thread.start()
    
    while not game.game_over:
        game.move_obstacles()
        game.check_collision()
        game.draw()
        time.sleep(0.2)
        
    print(f"Game Over! Final Score: {game.score}")

if __name__ == "__main__":
    main()
