import os
import time
import random
from pynput import keyboard
from threading import Thread

"""
TODO: 
- frog won't move
- there are cars in the water
- Cars always stay in the same formation b/c they have the same speed
- Cars go backwards relative to the emoji pointer
- The frog starts too far down
"""
class Frogger:
    def __init__(self):
        # (0, 0) is top left, with the y coordinate first, graphics style, not
        # math style.
        self.width = 30
        self.height = 15
        self.frog = '🐸'
        self.car = '🚗'
        self.log = '🪵'
        self.water = '💧'
        self.goal = '🏠'
        # 2 integers [y, x] tracking the frog's position. The frog starts 
        # at the bottom in the middle.
        # TODO: I don't actually like having the values initialized here just
        # for this one
        self.frog_pos = [self.height - 1, self.width // 2]
        # List of [y, x] coordinates for each car. Cars move right to left,
        # incrementing x position.
        self.cars = []
        # List of [y, x] coordinates for each log. Logs move left to right,
        # decrementing x position.
        self.logs = []
        self.score = 0
        self.game_over = False
        
    def init_obstacles(self):
        # Initialize cars. This adds 6 cars, in the 6 bottom rows of the play 
        # area. Their horizontal positions are random.
        #
        # TODO:
        # TBH, (5+i*2) and (6+i*2) are way over complicating things and if
        # we do want to keep one per row, we should just iterate over the 6
        # rows
        for i in range(3):
            self.cars.append([5 + i * 2, random.randint(0, self.width-1)])
            self.cars.append([6 + i * 2, random.randint(0, self.width-1)])
        
        # Initialize logs. This adds 3 logs, one per row, with random
        # horizontal positions.
        #
        # TODO:
        # Logs are in every other row... and the third log overlaps with the
        # cars. Whoops.
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
        # 2D list which represents the game board. Each cell contains a single
        # character. The board is recreated each frame with the current
        # positions.
        board = [[' ' for _ in range(self.width)] for _ in range(self.height)]
        
        # Draw water in the 6 rows under the houses
        for y in range(2, 8):
            for x in range(self.width):
                board[y][x] = self.water
                
        # Draw cars at their randomly initialized locations
        for car in self.cars:
            board[car[0]][car[1]] = self.car
            
        # Draw logs at their randomly initialized locations
        for log in self.logs:
            board[log[0]][log[1]] = self.log
            
        # Draw goals every 6 places along the top... although for some reason 
        # it is only drawing 3 of them even though this should go the full width
        # oooh... warp doesn't have fixed with font by default
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
        # TODO: This bakes in where the water is
        if 2 <= self.frog_pos[0] <= 7:
            on_log = False
            for log in self.logs:
                if log[0] == self.frog_pos[0] and log[1] == self.frog_pos[1]:
                    on_log = True
                    break
            if not on_log:
                self.game_over = True
                
        # Check goal
        # TODO: This will break if the frog renders over the icon before the
        # icon is checked. If the frog doesn't render before the icon is 
        # checked then the other checks ought to be able to use icon based
        # checking too. Icon or position based, one or the other. Not both.
        if self.frog_pos[0] == 0 and board[0][self.frog_pos[1]] == self.goal:
            self.score += 100
            self.frog_pos = [self.height - 1, self.width // 2]
            
    # TODO: These directions should be constants
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
        # TODO: enable this after keyboard input actually works. Rendering
        # hides the error messages 🙃
        #game.draw()
        time.sleep(0.2)
        
    print(f"Game Over! Final Score: {game.score}")


"""
def on_press(key):
    try:
        print(f'Key {key.char} pressed')
    except AttributeError:
        print(f'Special key {key} pressed')

def on_release(key):
    print(f'Key {key} released')
    if key == keyboard.Key.esc:
        # Stop listener
        return False

# Collect events until released
with keyboard.Listener(
        on_press=on_press,
        on_release=on_release) as listener:
    listener.join()
"""


if __name__ == "__main__":
    main()
